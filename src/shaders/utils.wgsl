//------------------------------------------------------------------------------
// Utility Functions for WGSL Shaders
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
// Float3 utility functions
//------------------------------------------------------------------------------

fn make_float3(x: f32, y: f32, z: f32) -> Float3 {
    return Float3(x, y, z);
}

fn fmin3(a: Float3, b: Float3) -> Float3 {
    return make_float3(min(a.x, b.x), min(a.y, b.y), min(a.z, b.z));
}

fn fmax3(a: Float3, b: Float3) -> Float3 {
    return make_float3(max(a.x, b.x), max(a.y, b.y), max(a.z, b.z));
}

fn add3(a: Float3, b: Float3) -> Float3 { 
    return make_float3(a.x + b.x, a.y + b.y, a.z + b.z); 
}

fn sub3(a: Float3, b: Float3) -> Float3 { 
    return make_float3(a.x - b.x, a.y - b.y, a.z - b.z); 
}

fn mul3s(a: Float3, s: f32) -> Float3 { 
    return make_float3(a.x * s, a.y * s, a.z * s); 
}

fn dot3(a: Float3, b: Float3) -> f32 { 
    return a.x*b.x + a.y*b.y + a.z*b.z; 
}

fn cross3(a: Float3, b: Float3) -> Float3 {
    return make_float3(
        a.y*b.z - a.z*b.y,
        a.z*b.x - a.x*b.z,
        a.x*b.y - a.y*b.x
    );
}

fn length3(v: Float3) -> f32 { 
    return sqrt(dot3(v,v)); 
}

fn normalize3(v: Float3) -> Float3 { 
    let len = length3(v); 
    return mul3s(v, 1.0/len); 
}

fn lerp3(a: Float3, b: Float3, t: f32) -> Float3 { 
    return add3(a, mul3s(sub3(b,a), t)); 
}

//------------------------------------------------------------------------------
// General utility functions
//------------------------------------------------------------------------------

// Safe division with fallback
fn safe_divide(a: f32, b: f32, fallback: f32) -> f32 {
    if (abs(b) < 1e-8) {
        return fallback;
    }
    return a / b;
}

// Clamp function for f32
fn clamp_f32(value: f32, min_val: f32, max_val: f32) -> f32 {
    return max(min_val, min(max_val, value));
}

// Convert from existing vec3<f32> to Float3 format
fn vec3_to_float3(v: vec3<f32>) -> Float3 {
    return make_float3(v.x, v.y, v.z);
}

// Convert from Float3 to vec3<f32> format
fn float3_to_vec3(f: Float3) -> vec3<f32> {
    return vec3<f32>(f.x, f.y, f.z);
}

//------------------------------------------------------------------------------
// AABB utility functions
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
// Conversion utility functions
//------------------------------------------------------------------------------

// Convert from existing BezierPatch struct to OptiX format
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
