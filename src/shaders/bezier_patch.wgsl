//------------------------------------------------------------------------------
// WGSL: Bezier‑Patch Ray Intersection (OptiX 코드 1:1 포팅)
//------------------------------------------------------------------------------

struct Float3 {
    x: f32,
    y: f32,
    z: f32,
};

fn make_float3(x: f32, y: f32, z: f32) -> Float3 {
    return Float3(x, y, z);
}

fn fmin3(a: Float3, b: Float3) -> Float3 {
    return make_float3(min(a.x, b.x), min(a.y, b.y), min(a.z, b.z));
}
fn fmax3(a: Float3, b: Float3) -> Float3 {
    return make_float3(max(a.x, b.x), max(a.y, b.y), max(a.z, b.z));
}

fn add3(a: Float3, b: Float3) -> Float3 { return make_float3(a.x + b.x, a.y + b.y, a.z + b.z); }
fn sub3(a: Float3, b: Float3) -> Float3 { return make_float3(a.x - b.x, a.y - b.y, a.z - b.z); }
fn mul3s(a: Float3, s: f32)   -> Float3 { return make_float3(a.x * s, a.y * s, a.z * s); }
fn dot3(a: Float3, b: Float3) -> f32   { return a.x*b.x + a.y*b.y + a.z*b.z; }
fn cross3(a: Float3, b: Float3) -> Float3 {
    return make_float3(
        a.y*b.z - a.z*b.y,
        a.z*b.x - a.x*b.z,
        a.x*b.y - a.y*b.x
    );
}
fn length3(v: Float3) -> f32 { return sqrt(dot3(v,v)); }
fn normalize3(v: Float3) -> Float3 { let len = length3(v); return mul3s(v, 1.0/len); }
fn lerp3(a: Float3, b: Float3, t: f32) -> Float3 { return add3(a, mul3s(sub3(b,a), t)); }

struct BezierPatchData {
    // 4×4 control points in row‑major order
    P: array<Float3, 16>,
    b_min: Float3,
    b_max: Float3,
};

struct RayData {
    ori : Float3,
    dir : Float3,
    t_min : f32,
    t_max : f32,
};

struct BezierHit {
    t : f32,
    u : f32,
    v : f32,
    n : Float3,
};

struct BezierEvalResult {
    P: Float3,
    dPu: Float3,
    dPv: Float3,
};

struct AABBResult {
    hit: bool,
    t_enter: f32,
    t_exit: f32,
};

struct NewtonResult {
    converged: bool,
    u: f32,
    v: f32,
    t: f32,
};

//------------------------------------------------------------------------------
// Bézier evaluation & partials (de Casteljau 2‑D) – WGSL
//------------------------------------------------------------------------------

fn bezier_eval(bp: BezierPatchData, u: f32, v: f32) -> BezierEvalResult {
    var Cv : array<Float3,4>;

    // vertical interpolation (along v)
    for (var i = 0u; i < 4u; i = i + 1u) {
        let idx = i*4u;
        let a = bp.P[idx + 0u];
        let b = bp.P[idx + 1u];
        let c = bp.P[idx + 2u];
        let d = bp.P[idx + 3u];
        let ab  = lerp3(a, b, v);
        let bc  = lerp3(b, c, v);
        let cd  = lerp3(c, d, v);
        let abc = lerp3(ab, bc, v);
        let bcd = lerp3(bc, cd, v);
        Cv[i]   = lerp3(abc, bcd, v);
    }

    // horizontal interpolation (along u)
    let A = lerp3(Cv[0], Cv[1], u);
    let B = lerp3(Cv[1], Cv[2], u);
    let C = lerp3(Cv[2], Cv[3], u);
    let D = lerp3(A, B, u);
    let E = lerp3(B, C, u);
    let P  = lerp3(D, E, u);
    let dPu = mul3s(sub3(E, D), 3.0);

    // swap u,v to get derivative w.r.t v
    var Ru : array<Float3,4>;
    for (var j = 0u; j < 4u; j = j + 1u) {
        let a = bp.P[0u*4u + j];
        let b = bp.P[1u*4u + j];
        let c = bp.P[2u*4u + j];
        let d = bp.P[3u*4u + j];
        let ab  = lerp3(a, b, u);
        let bc  = lerp3(b, c, u);
        let cd  = lerp3(c, d, u);
        let abc = lerp3(ab, bc, u);
        let bcd = lerp3(bc, cd, u);
        Ru[j]   = lerp3(abc, bcd, u);
    }
    let A2 = lerp3(Ru[0], Ru[1], v);
    let B2 = lerp3(Ru[1], Ru[2], v);
    let C2 = lerp3(Ru[2], Ru[3], v);
    let D2 = lerp3(A2, B2, v);
    let E2 = lerp3(B2, C2, v);
    let dPv = mul3s(sub3(E2, D2), 3.0);

    var result: BezierEvalResult;
    result.P = P;
    result.dPu = dPu;
    result.dPv = dPv;
    return result;
}

//------------------------------------------------------------------------------
// AABB intersect (slabs) – WGSL
//------------------------------------------------------------------------------

fn aabb_intersect(
        bmin : Float3, bmax : Float3,
        ro   : Float3, invDir : Float3,
        t_enter_in : f32, t_exit_in : f32) -> AABBResult {

    var t_enter = t_enter_in;
    var t_exit  = t_exit_in;

    // X
    var lo = (bmin.x - ro.x) * invDir.x;
    var hi = (bmax.x - ro.x) * invDir.x;
    if (lo > hi) { let tmp = lo; lo = hi; hi = tmp; }
    t_enter = max(t_enter, lo);
    t_exit  = min(t_exit , hi);
    if (t_enter > t_exit) { 
        var result: AABBResult;
        result.hit = false;
        result.t_enter = t_enter;
        result.t_exit = t_exit;
        return result;
    }

    // Y
    lo = (bmin.y - ro.y) * invDir.y;
    hi = (bmax.y - ro.y) * invDir.y;
    if (lo > hi) { let tmp = lo; lo = hi; hi = tmp; }
    t_enter = max(t_enter, lo);
    t_exit  = min(t_exit , hi);
    if (t_enter > t_exit) { 
        var result: AABBResult;
        result.hit = false;
        result.t_enter = t_enter;
        result.t_exit = t_exit;
        return result;
    }

    // Z
    lo = (bmin.z - ro.z) * invDir.z;
    hi = (bmax.z - ro.z) * invDir.z;
    if (lo > hi) { let tmp = lo; lo = hi; hi = tmp; }
    t_enter = max(t_enter, lo);
    t_exit  = min(t_exit , hi);
    if (t_enter > t_exit) { 
        var result: AABBResult;
        result.hit = false;
        result.t_enter = t_enter;
        result.t_exit = t_exit;
        return result;
    }

    var result: AABBResult;
    result.hit = true;
    result.t_enter = t_enter;
    result.t_exit = t_exit;
    return result;
}

//------------------------------------------------------------------------------
// Patch split helpers (splitV / subdivide_patch) – WGSL
//------------------------------------------------------------------------------

fn splitV(inp: ptr<function, array<array<Float3,4>,4>>,
          out_child: ptr<function, array<BezierPatchData,4>>,
          child_idx0: u32, child_idx1: u32) {
    for (var i = 0u; i < 4u; i = i + 1u) {
        var a = (*inp)[i][0];
        var b = (*inp)[i][1];
        var c = (*inp)[i][2];
        var d = (*inp)[i][3];
        let ab  = mul3s(add3(a,b), 0.5);
        let bc  = mul3s(add3(b,c), 0.5);
        let cd  = mul3s(add3(c,d), 0.5);
        let abc = mul3s(add3(ab,bc), 0.5);
        let bcd = mul3s(add3(bc,cd), 0.5);
        let abcd= mul3s(add3(abc,bcd),0.5);

        (*out_child)[child_idx0].P[i*4u+0u] = a;
        (*out_child)[child_idx0].P[i*4u+1u] = ab;
        (*out_child)[child_idx0].P[i*4u+2u] = abc;
        (*out_child)[child_idx0].P[i*4u+3u] = abcd;

        (*out_child)[child_idx1].P[i*4u+0u] = abcd;
        (*out_child)[child_idx1].P[i*4u+1u] = bcd;
        (*out_child)[child_idx1].P[i*4u+2u] = cd;
        (*out_child)[child_idx1].P[i*4u+3u] = d;
    }
}

fn subdivide_patch(src: BezierPatchData, out_child: ptr<function, array<BezierPatchData,4>>) {
    var L : array<array<Float3,4>,4>;
    var R : array<array<Float3,4>,4>;

    // U‑direction split
    for (var j = 0u; j < 4u; j = j + 1u) {
        var a = src.P[0*4u + j];
        var b = src.P[1*4u + j];
        var c = src.P[2*4u + j];
        var d = src.P[3*4u + j];
        let ab  = mul3s(add3(a,b), 0.5);
        let bc  = mul3s(add3(b,c), 0.5);
        let cd  = mul3s(add3(c,d), 0.5);
        let abc = mul3s(add3(ab,bc), 0.5);
        let bcd = mul3s(add3(bc,cd), 0.5);
        let abcd= mul3s(add3(abc,bcd),0.5);

        L[0][j] = a;    L[1][j] = ab;   L[2][j] = abc;  L[3][j] = abcd;
        R[0][j] = abcd; R[1][j] = bcd;  R[2][j] = cd;   R[3][j] = d;
    }
    // V split - 올바른 OptiX 순서
    // Child 0: (u0,v0) to (u0+du, v0+dv) - 왼쪽 아래
    // Child 1: (u0+du,v0) to (u1, v0+dv) - 오른쪽 아래  
    // Child 2: (u0,v0+dv) to (u0+du, v1) - 왼쪽 위
    // Child 3: (u0+du,v0+dv) to (u1, v1) - 오른쪽 위
    splitV(&L, out_child, 0u, 2u);  // L -> child 0, 2
    splitV(&R, out_child, 1u, 3u);  // R -> child 1, 3

    // AABB update
    for (var c = 0u; c < 4u; c = c + 1u) {
        var mn = (*out_child)[c].P[0];
        var mx = mn;
        for (var i = 0u; i < 4u; i = i + 1u) {
            for (var j = 0u; j < 4u; j = j + 1u) {
                let p = (*out_child)[c].P[i*4u+j];
                mn = fmin3(mn, p);
                mx = fmax3(mx, p);
            }
        }
        (*out_child)[c].b_min = mn;
        (*out_child)[c].b_max = mx;
    }
}

//------------------------------------------------------------------------------
// Newton iteration refine – WGSL
//------------------------------------------------------------------------------

fn newton_refine(bp: BezierPatchData, ray: RayData,
                 u_in: f32, v_in: f32, t_in: f32) -> NewtonResult {
    var u = u_in;
    var v = v_in;
    var t = t_in;

    let MAX_IT = 4u;  // 반복 횟수 줄임
    let EPS_F  = 1e-3; // 더 관대한 수렴 기준
    let EPS_P  = 1e-4;

    for (var it = 0u; it < MAX_IT; it = it + 1u) {
        let res  = bezier_eval(bp, u, v);
        let P    = res.P;
        let dPu  = res.dPu;
        let dPv  = res.dPv;

        let Fx = P.x - (ray.ori.x + t*ray.dir.x);
        let Fy = P.y - (ray.ori.y + t*ray.dir.y);
        let Fz = P.z - (ray.ori.z + t*ray.dir.z);
        let F  = make_float3(Fx, Fy, Fz);
        if (length3(F) < EPS_F) {
            if (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) {
                var result: NewtonResult;
                result.converged = true;
                result.u = u;
                result.v = v;
                result.t = t;
                return result;
            }
            var result: NewtonResult;
            result.converged = false;
            result.u = u;
            result.v = v;
            result.t = t;
            return result;
        }

        let c0 = dPu;
        let c1 = dPv;
        let c2 = make_float3(-ray.dir.x, -ray.dir.y, -ray.dir.z);
        let r0 = cross3(c1, c2);
        let r1 = cross3(c2, c0);
        let r2 = cross3(c0, c1);
        let det = dot3(c0, r0);
        if (abs(det) < 1e-8) { 
            var result: NewtonResult;
            result.converged = false;
            result.u = u;
            result.v = v;
            result.t = t;
            return result;
        }
        let invD = 1.0 / det;

        let du = dot3(r0, F) * (-invD);
        let dv = dot3(r1, F) * (-invD);
        let dt = dot3(r2, F) * (-invD);
        u = u + du; v = v + dv; t = t + dt;
        if (abs(du) < EPS_P && abs(dv) < EPS_P && abs(dt) < EPS_P) {
            if (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) {
                var result: NewtonResult;
                result.converged = true;
                result.u = u;
                result.v = v;
                result.t = t;
                return result;
            }
            var result: NewtonResult;
            result.converged = false;
            result.u = u;
            result.v = v;
            result.t = t;
            return result;
        }
    }
    var result: NewtonResult;
    result.converged = false;
    result.u = u;
    result.v = v;
    result.t = t;
    return result;
}

//------------------------------------------------------------------------------
// Convert from existing BezierPatch struct to OptiX format
//------------------------------------------------------------------------------

fn convert_to_optix_format(bezierPatch: BezierPatch) -> BezierPatchData {
    var result: BezierPatchData;
    
    // Convert vec3<f32> to Float3
    for (var i = 0u; i < 16u; i = i + 1u) {
        let cp = bezierPatch.controlPoints[i];
        result.P[i] = make_float3(cp.x, cp.y, cp.z);
    }
    
    let minCorner = bezierPatch.minCorner;
    let maxCorner = bezierPatch.maxCorner;
    result.b_min = make_float3(minCorner.x, minCorner.y, minCorner.z);
    result.b_max = make_float3(maxCorner.x, maxCorner.y, maxCorner.z);
    
    return result;
}

fn convert_ray_format(ray: Ray) -> RayData {
    var result: RayData;
    result.ori = make_float3(ray.origin.x, ray.origin.y, ray.origin.z);
    result.dir = make_float3(ray.direction.x, ray.direction.y, ray.direction.z);
    result.t_min = 0.001;  // 기본값
    result.t_max = 1000.0; // 기본값
    return result;
}

//------------------------------------------------------------------------------
// OptiX-style intersection function
//------------------------------------------------------------------------------

// 베지어 패치 인터섹션 함수 - UV 파라미터도 반환
fn intersect_bezier_patch_with_uv(ray: Ray, bezierPatch: BezierPatch, t_min: f32, t_max: f32) -> vec4<f32> {
    let optix_patch = convert_to_optix_format(bezierPatch);
    var optix_ray = convert_ray_format(ray);
    optix_ray.t_min = t_min;
    optix_ray.t_max = t_max;
    
    let invDir = make_float3(
        select(1e-7, 1.0/optix_ray.dir.x, abs(optix_ray.dir.x) > 1e-7),
        select(1e-7, 1.0/optix_ray.dir.y, abs(optix_ray.dir.y) > 1e-7),
        select(1e-7, 1.0/optix_ray.dir.z, abs(optix_ray.dir.z) > 1e-7)
    );

    // 먼저 간단한 1-level 세분화로 테스트
    var children: array<BezierPatchData, 4>;
    subdivide_patch(optix_patch, &children);
    
    var best_t = optix_ray.t_max;
    var best_u = -1.0;
    var best_v = -1.0;
    var found_hit = false;
    
    // 각 자식 패치에 대해 테스트 - 파라미터 공간 매핑 적용
    for (var c = 0u; c < 4u; c = c + 1u) {
        let child_aabb = aabb_intersect(children[c].b_min, children[c].b_max,
                                      optix_ray.ori, invDir,
                                      optix_ray.t_min, best_t);
        if (child_aabb.hit) {
            let t_guess = child_aabb.t_enter;
            
            // 각 자식의 파라미터 공간 범위 정의
            var u_base: f32;
            var v_base: f32;
            if (c == 0u) { u_base = 0.0; v_base = 0.0; }       // 왼쪽 아래
            else if (c == 1u) { u_base = 0.5; v_base = 0.0; }  // 오른쪽 아래
            else if (c == 2u) { u_base = 0.0; v_base = 0.5; }  // 왼쪽 위
            else { u_base = 0.5; v_base = 0.5; }              // 오른쪽 위 (c == 3u)
            
            // 로컬 좌표를 글로벌 좌표로 변환하여 샘플링
            let sample_offsets = array<vec2<f32>, 5>(
                vec2<f32>(0.25, 0.25), // 중심
                vec2<f32>(0.125, 0.125), // 왼쪽 아래
                vec2<f32>(0.375, 0.125), // 오른쪽 아래
                vec2<f32>(0.125, 0.375), // 왼쪽 위
                vec2<f32>(0.375, 0.375)  // 오른쪽 위
            );
            
            for (var s = 0u; s < 5u; s = s + 1u) {
                // 로컬 파라미터를 자식 패치 내의 상대 좌표로 변환
                let local_u = sample_offsets[s].x / 0.5; // 0.5로 나누어 [0,1] 범위로
                let local_v = sample_offsets[s].y / 0.5;
                
                // 더 나은 초기 t 추정: 패치 중심점까지의 거리
                let patch_center_eval = bezier_eval(children[c], local_u, local_v);
                let to_center = sub3(patch_center_eval.P, optix_ray.ori);
                let better_t_guess = max(t_guess, dot3(to_center, optix_ray.dir));
                
                let newton_result = newton_refine(children[c], optix_ray, local_u, local_v, better_t_guess);
                if (newton_result.converged && newton_result.t < best_t && newton_result.t > optix_ray.t_min) {
                    best_t = newton_result.t;
                    // 글로벌 UV 좌표 계산
                    best_u = u_base + newton_result.u * 0.5;
                    best_v = v_base + newton_result.v * 0.5;
                    found_hit = true;
                    break; // 첫 번째 교차점을 찾으면 중단
                }
            }
        }
    }
    
    if (found_hit) {
        return vec4<f32>(best_t, best_u, best_v, 1.0); // w=1은 히트를 의미
    } else {
        return vec4<f32>(-1.0, 0.0, 0.0, 0.0); // w=0은 미스를 의미
    }
}

fn intersect_bezier_patch(ray: Ray, bezierPatch: BezierPatch, t_min: f32, t_max: f32) -> f32 {
    let result = intersect_bezier_patch_with_uv(ray, bezierPatch, t_min, t_max);
    if (result.w > 0.5) { // 히트
        return result.x; // t 값 반환
    } else {
        return -1.0;
    }
}

// 베지어 패치에서 정확한 법선 계산 (UV 파라미터 사용)
fn calculate_bezier_patch_normal(bezierPatch: BezierPatch, u: f32, v: f32) -> vec3<f32> {
    let optix_patch = convert_to_optix_format(bezierPatch);
    let eval_result = bezier_eval(optix_patch, u, v);
    
    // 편미분 벡터들로부터 법선 계산 (외적)
    let dPu_vec3 = vec3<f32>(eval_result.dPu.x, eval_result.dPu.y, eval_result.dPu.z);
    let dPv_vec3 = vec3<f32>(eval_result.dPv.x, eval_result.dPv.y, eval_result.dPv.z);
    
    return normalize(cross(dPu_vec3, dPv_vec3));
}