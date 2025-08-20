fn distance_squared(p1: vec3<f32>, p2: vec3<f32>) -> f32 {
    let d = p1 - p2;
    return dot(d, d);
}

// 회전 행렬 생성 함수들
fn rotation_matrix_x(angle: f32) -> mat3x3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, c, -s),
        vec3<f32>(0.0, s, c)
    );
}

fn rotation_matrix_y(angle: f32) -> mat3x3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat3x3<f32>(
        vec3<f32>(c, 0.0, s),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(-s, 0.0, c)
    );
}

fn rotation_matrix_z(angle: f32) -> mat3x3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat3x3<f32>(
        vec3<f32>(c, -s, 0.0),
        vec3<f32>(s, c, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );
}

// Ray-Sphere intersection with t range clamping
fn ray_sphere_intersect(ray: Ray, sphere: Sphere) -> f32 {
    let oc = ray.origin - sphere.center;
    let a = dot(ray.direction, ray.direction);
    let b = 2.0 * dot(oc, ray.direction);
    let c = dot(oc, oc) - sphere.radius * sphere.radius;
    let discriminant = b * b - 4.0 * a * c;
    
    if (discriminant < 0.0) {
        return -1.0;
    }
    
    let sqrt_discriminant = sqrt(discriminant);
    
    // 가까운 교차점부터 확인
    let t1 = (-b - sqrt_discriminant) / (2.0 * a);
    if (t1 >= ray.t_min && t1 <= ray.t_max) {
        return t1;
    }
    
    // 먼 교차점 확인
    let t2 = (-b + sqrt_discriminant) / (2.0 * a);
    if (t2 >= ray.t_min && t2 <= ray.t_max) {
        return t2;
    }
    
    return -1.0;
}

// Ray-Cylinder intersection with t range clamping
fn ray_cylinder_intersect(ray: Ray, c: Cylinder) -> f32 {
    var closest = -1.0;
    let A = c.axis; // normalized
    let h = c.halfHeight;
    let ro = ray.origin - c.center;
    let rd = ray.direction;
    let roA = dot(ro, A);
    let rdA = dot(rd, A);
    // Projected components perpendicular to axis
    let w = ro - roA * A;
    let v = rd - rdA * A;
    let a = dot(v,v);
    let b = 2.0 * dot(w,v);
    let cterm = dot(w,w) - c.radius * c.radius;
    let disc = b*b - 4.0*a*cterm;
    if (disc >= 0.0 && a != 0.0) {
        let sdisc = sqrt(disc);
        let inv2a = 0.5 / a;
        let t1 = (-b - sdisc) * inv2a;
        let y1 = roA + t1 * rdA;
        if (t1 >= ray.t_min && t1 <= ray.t_max && abs(y1) <= h) { closest = t1; }
        let t2 = (-b + sdisc) * inv2a;
        let y2 = roA + t2 * rdA;
        if (t2 >= ray.t_min && t2 <= ray.t_max && abs(y2) <= h && (closest < 0.0 || t2 < closest)) { closest = t2; }
    }
    // Caps
    if (abs(rdA) > 1e-4) {
        let t_cap_top = ( h - roA) / rdA; // y=+h plane
        if (t_cap_top >= ray.t_min && t_cap_top <= ray.t_max && (closest < 0.0 || t_cap_top < closest)) {
            let p = ro + rd * t_cap_top;
            let radial = p - A * (roA + rdA * t_cap_top);
            if (dot(radial, radial) <= c.radius * c.radius) { closest = t_cap_top; }
        }
        let t_cap_bot = (-h - roA) / rdA; // y=-h plane
        if (t_cap_bot >= ray.t_min && t_cap_bot <= ray.t_max && (closest < 0.0 || t_cap_bot < closest)) {
            let p = ro + rd * t_cap_bot;
            let radial = p - A * (roA + rdA * t_cap_bot);
            if (dot(radial, radial) <= c.radius * c.radius) { closest = t_cap_bot; }
        }
    }
    return closest;
}

// 직육면체-광선 교차 검사
fn ray_box_intersect(ray: Ray, box: Box) -> f32 {
    // 회전 행렬 계산 (Z * Y * X 순서)
    let rotation_x = rotation_matrix_x(box.rotation.x);
    let rotation_y = rotation_matrix_y(box.rotation.y);
    let rotation_z = rotation_matrix_z(box.rotation.z);
    let rotation_matrix = rotation_z * rotation_y * rotation_x;
    let inverse_rotation = transpose(rotation_matrix);

    // 광선을 Box의 로컬 좌표계로 변환
    let local_origin = inverse_rotation * (ray.origin - box.center);
    let local_direction = inverse_rotation * ray.direction;

    // 직육면체의 절반 크기
    let half_size = box.size * 0.5;
    
    // 각 축에 대해 교차점 계산
    let inv_dir = 1.0 / local_direction;
    
    let t1 = (-half_size - local_origin) * inv_dir;
    let t2 = (half_size - local_origin) * inv_dir;
    
    let t_min_vec = min(t1, t2);
    let t_max_vec = max(t1, t2);
    
    let t_near = max(max(t_min_vec.x, t_min_vec.y), t_min_vec.z);
    let t_far = min(min(t_max_vec.x, t_max_vec.y), t_max_vec.z);

    // 교차 검사
    if (t_near > t_far || t_far < 0.001) {
        return -1.0; // 교차하지 않음
    }

    // 가장 가까운 교차점 반환
    if (t_near > 0.001) {
        return t_near;
    } else if (t_far > 0.001) {
        return t_far;
    }
    
    return -1.0;
}

// 직육면체의 법선 계산
fn calculate_box_normal(box: Box, hit_point: vec3<f32>) -> vec3<f32> {
    // 회전 행렬 계산
    let rotation_x = rotation_matrix_x(box.rotation.x);
    let rotation_y = rotation_matrix_y(box.rotation.y);
    let rotation_z = rotation_matrix_z(box.rotation.z);
    let rotation_matrix = rotation_z * rotation_y * rotation_x;
    let inverse_rotation = transpose(rotation_matrix);

    // 교차점을 로컬 좌표계로 변환
    let local_point = inverse_rotation * (hit_point - box.center);
    let half_size = box.size * 0.5;

    // 가장 가까운 면 찾기
    let abs_point = abs(local_point / half_size);
    let max_coord = max(max(abs_point.x, abs_point.y), abs_point.z);
    
    var local_normal: vec3<f32>;
    if (abs(abs_point.x - max_coord) < 0.001) {
        // X면에 교차
        local_normal = vec3<f32>(sign(local_point.x), 0.0, 0.0);
    } else if (abs(abs_point.y - max_coord) < 0.001) {
        // Y면에 교차
        local_normal = vec3<f32>(0.0, sign(local_point.y), 0.0);
    } else {
        // Z면에 교차
        local_normal = vec3<f32>(0.0, 0.0, sign(local_point.z));
    }

    // 월드 좌표계로 변환
    return normalize(rotation_matrix * local_normal);
}

// Plane-Ray 교차 검사
fn ray_plane_intersect(ray: Ray, plane: Plane) -> f32 {
    // Normalized basis directly provided
    let n = normalize(plane.normal);
    let denom = dot(n, ray.direction);
    if (abs(denom) < 1e-4) { return -1.0; }
    let t = dot(plane.center - ray.origin, n) / denom;
    if (t < ray.t_min || t > ray.t_max) { return -1.0; }

    let hit_point = ray.origin + ray.direction * t;
    let tangent1_raw = plane.xdir;
    let tangent2_raw = plane.ydir;
    // Orthonormalize defensively
    var t1 = tangent1_raw;
    if (length(t1) < 1e-6 || abs(dot(normalize(t1), n)) > 0.999) {
        // Rebuild a tangent if invalid or parallel
        let helper = select(vec3<f32>(0.0,1.0,0.0), vec3<f32>(1.0,0.0,0.0), abs(n.y) > 0.9);
        t1 = normalize(cross(helper, n));
    } else {
        t1 = normalize(t1 - n * dot(t1, n));
    }
    var t2 = tangent2_raw;
    if (length(t2) < 1e-6 || abs(dot(normalize(t2), n)) > 0.999) {
        t2 = normalize(cross(n, t1));
    } else {
        t2 = normalize(t2 - n * dot(t2, n));
    }
    // Ensure right-handed
    if (dot(cross(t1, t2), n) < 0.0) { t2 = -t2; }

    let offset = hit_point - plane.center;
    let u = dot(offset, t1);
    let v = dot(offset, t2);
    let half_w = plane.size.x * 0.5;
    let half_h = plane.size.y * 0.5;
    if (abs(u) <= half_w && abs(v) <= half_h) { return t; }
    return -1.0;
}

// Plane 법선 계산
fn calculate_plane_normal(plane: Plane, hit_point: vec3<f32>) -> vec3<f32> {
    return normalize(plane.normal);
}

// Utility function to create an interval
fn make_interval(min_val: f32, max_val: f32) -> Interval {
    var interval: Interval;
    interval.min = min_val;
    interval.max = max_val;
    return interval;
}

// Check if a value is within an interval
fn contains(interval: Interval, x: f32) -> bool {
    return interval.min <= x && x <= interval.max;
}

// Check if a value is within an interval (exclusive bounds)
fn surrounds(interval: Interval, x: f32) -> bool {
    return interval.min < x && x < interval.max;
}

// Ray-Circle intersection (circle on a plane)
fn ray_circle_intersect(ray: Ray, circle: Circle) -> f32 {
    let plane_normal = normalize(circle.normal);
    let denom = dot(ray.direction, plane_normal);
    
    // 레이가 평면과 평행한 경우
    if (abs(denom) < 0.001) {
        return -1.0;
    }
    
    // 평면과의 교차점 계산
    let t = dot(circle.center - ray.origin, plane_normal) / denom;
    
    if (t < ray.t_min || t > ray.t_max) {
        return -1.0;
    }
    
    // 교차점이 원 내부에 있는지 확인
    let hit_point = ray.origin + ray.direction * t;
    let to_hit = hit_point - circle.center;
    let distance_squared = dot(to_hit, to_hit);
    
    if (distance_squared <= circle.radius * circle.radius) {
        return t;
    }
    
    return -1.0;
}

// Circle 법선 계산 (항상 원이 놓인 평면의 법선)
fn calculate_circle_normal(circle: Circle, hit_point: vec3<f32>) -> vec3<f32> {
    return normalize(circle.normal);
}

// Ray-Ellipse intersection (ellipse on a plane)
fn ray_ellipse_intersect(ray: Ray, ellipse: Ellipse) -> f32 {
    let plane_normal = normalize(ellipse.normal);
    let denom = dot(ray.direction, plane_normal);
    
    // 레이가 평면과 평행한 경우
    if (abs(denom) < 0.001) {
        return -1.0;
    }
    
    // 평면과의 교차점 계산
    let t = dot(ellipse.center - ray.origin, plane_normal) / denom;
    
    if (t < ray.t_min || t > ray.t_max) {
        return -1.0;
    }
    
    // 교차점을 타원의 로컬 좌표계로 변환
    let hit_point = ray.origin + ray.direction * t;
    let to_hit = hit_point - ellipse.center;
    
    // 회전 변환 적용 (역회전)
    let rot_x = rotation_matrix_x(-ellipse.rotation.x);
    let rot_y = rotation_matrix_y(-ellipse.rotation.y);
    let rot_z = rotation_matrix_z(-ellipse.rotation.z);
    let rotation_matrix = rot_z * rot_y * rot_x;
    
    let local_point = rotation_matrix * to_hit;
    
    // 타원의 방정식: (x/a)^2 + (y/b)^2 <= 1 (z는 평면상이므로 0으로 간주)
    let x_normalized = local_point.x / ellipse.radiusA;
    let y_normalized = local_point.y / ellipse.radiusB;
    let ellipse_value = x_normalized * x_normalized + y_normalized * y_normalized;
    
    if (ellipse_value <= 1.0) {
        return t;
    }
    
    return -1.0;
}

// Ellipse 법선 계산 (항상 타원이 놓인 평면의 법선)
fn calculate_ellipse_normal(ellipse: Ellipse, hit_point: vec3<f32>) -> vec3<f32> {
    return normalize(ellipse.normal);
}

// Ray-Line intersection (line as a thin rectangular box)
fn ray_line_intersect(ray: Ray, line: Line) -> f32 {
    // Line을 얇은 직사각형으로 처리
    let line_direction = normalize(line.end - line.start);
    let line_length = length(line.end - line.start);
    let line_center = (line.start + line.end) * 0.5;
    
    // Line에 수직인 벡터들 생성 (두께 방향)
    var up_vector = vec3<f32>(0.0, 1.0, 0.0);
    if (abs(dot(line_direction, up_vector)) > 0.9) {
        up_vector = vec3<f32>(1.0, 0.0, 0.0);
    }
    
    let side_vector1 = normalize(cross(line_direction, up_vector));
    let side_vector2 = normalize(cross(line_direction, side_vector1));
    
    // Line을 box로 변환 (길이 x 두께 x 두께)
    let half_length = line_length * 0.5;
    let half_thickness = line.thickness * 0.5;
    
    // Ray를 Line의 로컬 좌표계로 변환
    let ray_to_center = ray.origin - line_center;
    
    // 로컬 좌표계에서의 ray 방향과 원점
    let local_ray_origin = vec3<f32>(
        dot(ray_to_center, line_direction),
        dot(ray_to_center, side_vector1),
        dot(ray_to_center, side_vector2)
    );
    let local_ray_direction = vec3<f32>(
        dot(ray.direction, line_direction),
        dot(ray.direction, side_vector1),
        dot(ray.direction, side_vector2)
    );
    
    // AABB (Axis-Aligned Bounding Box) 교차 검사
    let box_min = vec3<f32>(-half_length, -half_thickness, -half_thickness);
    let box_max = vec3<f32>(half_length, half_thickness, half_thickness);
    
    var t_min = (box_min.x - local_ray_origin.x) / local_ray_direction.x;
    var t_max = (box_max.x - local_ray_origin.x) / local_ray_direction.x;
    if (t_min > t_max) {
        let temp = t_min;
        t_min = t_max;
        t_max = temp;
    }
    
    var ty_min = (box_min.y - local_ray_origin.y) / local_ray_direction.y;
    var ty_max = (box_max.y - local_ray_origin.y) / local_ray_direction.y;
    if (ty_min > ty_max) {
        let temp = ty_min;
        ty_min = ty_max;
        ty_max = temp;
    }
    
    if (t_min > ty_max || ty_min > t_max) {
        return -1.0;
    }
    
    if (ty_min > t_min) {
        t_min = ty_min;
    }
    if (ty_max < t_max) {
        t_max = ty_max;
    }
    
    var tz_min = (box_min.z - local_ray_origin.z) / local_ray_direction.z;
    var tz_max = (box_max.z - local_ray_origin.z) / local_ray_direction.z;
    if (tz_min > tz_max) {
        let temp = tz_min;
        tz_min = tz_max;
        tz_max = temp;
    }
    
    if (t_min > tz_max || tz_min > t_max) {
        return -1.0;
    }
    
    if (tz_min > t_min) {
        t_min = tz_min;
    }
    if (tz_max < t_max) {
        t_max = tz_max;
    }
    
    // 가장 가까운 교차점 반환
    if (t_min >= ray.t_min && t_min <= ray.t_max) {
        return t_min;
    }
    if (t_max >= ray.t_min && t_max <= ray.t_max) {
        return t_max;
    }
    
    return -1.0;
}

// Line 법선 계산
fn calculate_line_normal(line: Line, hit_point: vec3<f32>) -> vec3<f32> {
    let line_direction = normalize(line.end - line.start);
    let line_center = (line.start + line.end) * 0.5;
    let to_hit = hit_point - line_center;
    
    // 선의 방향에 수직인 방향으로 법선 계산
    let perpendicular = to_hit - line_direction * dot(to_hit, line_direction);
    if (length(perpendicular) > 0.001) {
        return normalize(perpendicular);
    }
    
    // 기본 법선 (위쪽 방향)
    return vec3<f32>(0.0, 1.0, 0.0);
}

// Torus SDF (Signed Distance Function) - 뚜껑 없는 열린 도넛
fn torus_sdf(p: vec3<f32>, torus: Torus) -> f32 {
    // Semantics: xdir = radial vector from center to start of main arc (R along 0deg)
    //            ydir = tangent direction of main arc at start (positive sweep direction)
    //            normal n = cross(xdir, ydir)
    var xdir = normalize(torus.xdir);
    var ydir = normalize(torus.ydir);
    var n = cross(xdir, ydir);
    let nLen = length(n);
    if (nLen < 1e-6) {
        // fallback orthogonalization if input degenerate
        if (abs(xdir.y) < 0.9) { ydir = normalize(cross(vec3<f32>(0.0,1.0,0.0), xdir)); }
        else { ydir = normalize(cross(vec3<f32>(0.0,0.0,1.0), xdir)); }
        n = cross(xdir, ydir);
    } else {
        n = n / nLen;
    }
    // Project point
    let rel = p - torus.center;
    let lx = dot(rel, xdir);      // in-plane radial component (cos theta * R approx)
    let ly = dot(rel, ydir);      // in-plane tangential component (sin theta * R approx)
    let ln = dot(rel, n);         // out-of-plane (tube minor circle axis)
    let radial = length(vec2<f32>(lx, ly));
    let q = vec2<f32>(radial - torus.majorRadius, ln);
    return length(q) - torus.minorRadius;
}

// 토러스 각도 체크 함수
fn is_point_in_torus_angle_range(point: vec3<f32>, torus: Torus) -> bool {
    // Angle measured in plane spanned by (xdir, ydir)
    let xdir = normalize(torus.xdir);
    let ydir = normalize(torus.ydir);
    var rel = point - torus.center;
    let lx = dot(rel, xdir);
    let ly = dot(rel, ydir);
    var ang = atan2(ly, lx); // 0 at +xdir, increases toward +ydir
    if (ang < 0.0) { ang = ang + 2.0 * 3.14159265359; }
    return ang <= torus.angle;
}

// Ray-Torus intersection using sphere tracing (SDF-based ray marching)
// Fast torus coarse culling: bounding sphere test before expensive SDF marching.
fn ray_torus_fast_cull(ray: Ray, torus: Torus) -> bool {
    let R = torus.majorRadius + torus.minorRadius; // outer radius bound
    let rel = torus.center - ray.origin;
    let dist2 = dot(rel, rel);
    // Project onto ray
    let tca = dot(rel, ray.direction);
    // If center is behind and origin outside sphere, reject
    if (tca < 0.0 && dist2 > R*R) { return false; }
    let d2 = dist2 - tca * tca;
    if (d2 > R*R) { return false; }
    return true;
}

fn ray_torus_intersect(ray: Ray, torus: Torus) -> f32 {
    // Early coarse rejection
    if (!ray_torus_fast_cull(ray, torus)) { return -1.0; }
    let max_steps = 128;
    let min_distance = 0.001;
    var t = ray.t_min;
    
    for (var i = 0; i < max_steps; i = i + 1) {
        if (t > ray.t_max) {
            break;
        }
        
        let current_pos = ray.origin + ray.direction * t;
        let distance = torus_sdf(current_pos, torus);
        
        // 표면에 충분히 가까워졌으면 각도 체크
        if (abs(distance) < min_distance) {  // abs()로 내부/외부 모두 처리
            // 각도 범위 내에 있는지 확인
            if (is_point_in_torus_angle_range(current_pos, torus)) {
                return t;
            } else {
                // 각도 범위 밖이면 계속 진행
                t = t + min_distance * 3.0;
                continue;
            }
        }
        
        // 거리만큼 전진 (절댓값 사용으로 내부에서도 진행)
        t = t + max(abs(distance), min_distance * 0.5);
    }
    
    return -1.0; // 교차하지 않음
}

// Torus 법선 계산 (SDF gradient 이용)
fn calculate_torus_normal(torus: Torus, hit_point: vec3<f32>) -> vec3<f32> {
    let xdir = normalize(torus.xdir);
    let ydir = normalize(torus.ydir);
    var n = cross(xdir, ydir);
    let nLen = length(n);
    if (nLen < 1e-6) { n = vec3<f32>(0.0,1.0,0.0); } else { n = n / nLen; }
    let rel = hit_point - torus.center;
    let lx = dot(rel, xdir);
    let ly = dot(rel, ydir);
    let ln = dot(rel, n);
    let radial = length(vec2<f32>(lx, ly));
    let dr = radial - torus.majorRadius;
    let denom = max(sqrt(dr*dr + ln*ln), 1e-6);
    let d_radial = dr / denom;
    let d_ln = ln / denom;
    let radial_dir = (lx * xdir + ly * ydir) / max(radial, 1e-6);
    let grad = d_radial * radial_dir + d_ln * n;
    return normalize(grad);
}

// Cone SDF (Signed Distance Function)
fn cone_sdf(point: vec3<f32>, cone: Cone) -> f32 {
    // 원뿔의 로컬 좌표계로 변환
    let local_point = point - cone.center;
    
    // 축 방향으로의 투영
    let h = dot(local_point, cone.axis);
    
    // 원뿔의 높이 범위 체크 (0 <= h <= height)
    if (h < 0.0) {
        // 꼭짓점보다 위쪽 - 꼭짓점까지의 거리
        return length(local_point);
    }
    
    if (h > cone.height) {
        // 밑면보다 아래쪽
        let base_center = cone.axis * cone.height;
        let to_base = local_point - base_center;
        let radial_dist = length(to_base - cone.axis * dot(to_base, cone.axis));
        
        if (radial_dist <= cone.radius) {
            // 밑면 원 내부 - 밑면까지의 거리
            return h - cone.height;
        } else {
            // 밑면 원 외부 - 밑면 가장자리까지의 거리
            let edge_point = base_center + normalize(to_base - cone.axis * dot(to_base, cone.axis)) * cone.radius;
            return length(local_point - edge_point);
        }
    }
    
    // 원뿔 높이 범위 내부
    let radius_at_height = cone.radius * (cone.height - h) / cone.height;
    let axis_projection = cone.axis * h;
    let radial_vector = local_point - axis_projection;
    let radial_distance = length(radial_vector);
    
    // 원뿔 표면까지의 부호 있는 거리
    return radial_distance - radius_at_height;
}

// Ray-Cone intersection using analytical method (quadratic equation)
fn ray_cone_intersect(ray: Ray, cone: Cone) -> f32 {
    // Apex는 center에서 height/2 만큼 축 반대 방향
    let apex = cone.center - cone.axis * (cone.height * 0.5);
    let d = ray.direction;
    let v = cone.axis;
    let oc = ray.origin - apex;

    // 미리 계산된 cosAlpha, sinAlpha 사용
    let cos_a = cone.cosAlpha;
    let cos_a_sq = cos_a * cos_a;

    let dv = dot(d, v);
    let ocv = dot(oc, v);
    let a = dv * dv - cos_a_sq;
    let b = 2.0 * (dv * ocv - dot(d, oc) * cos_a_sq);
    let c = ocv * ocv - dot(oc, oc) * cos_a_sq;

    let disc = b * b - 4.0 * a * c;
    if (disc < 0.0) { return -1.0; }
    let sdisc = sqrt(disc);
    var closest_t = -1.0;
    let h = cone.height;
    // 후보 루트들
    let t1 = (-b - sdisc) / (2.0 * a);
    let t2 = (-b + sdisc) / (2.0 * a);
    if (t1 >= ray.t_min && t1 <= ray.t_max) {
        let hit_height = dot((ray.origin + d * t1) - apex, v);
        if (hit_height >= 0.0 && hit_height <= h) { closest_t = t1; }
    }
    if (t2 >= ray.t_min && t2 <= ray.t_max && (closest_t < 0.0 || t2 < closest_t)) {
        let hit_height = dot((ray.origin + d * t2) - apex, v);
        if (hit_height >= 0.0 && hit_height <= h) { closest_t = t2; }
    }

    // 밑면 원판 교차 (base at apex + v*h)
    let base_center = apex + v * h;
    let denom = dot(d, v);
    if (abs(denom) > 0.001) {
        let t_base = dot(base_center - ray.origin, v) / denom;
        if (t_base >= ray.t_min && t_base <= ray.t_max && (closest_t < 0.0 || t_base < closest_t)) {
            let hp = ray.origin + d * t_base;
            let radial = hp - base_center;
            let dist = length(radial - v * dot(radial, v));
            if (dist <= cone.radius) { closest_t = t_base; }
        }
    }
    return closest_t;
}

// Cone 법선 계산 (해석적 방법)
fn calculate_cone_normal(cone: Cone, hit_point: vec3<f32>) -> vec3<f32> {
    let v = cone.axis;  // 원뿔 축
    // center를 height의 중간점으로 사용하므로 apex는 center에서 height/2만큼 아래
    let apex = cone.center - v * (cone.height * 0.5);  
    let base_center = apex + v * cone.height;  // 밑면 중심
    
    // 교차점이 밑면에 있는지 확인
    let hit_to_base = hit_point - base_center;
    let distance_to_base = abs(dot(hit_to_base, v));
    
    if (distance_to_base < 0.01) {
        // 밑면에 있으면 밑면 법선 반환 (축 방향)
        return v;
    }
    
    // 원뿔 측면에 있는 경우
    let hit_to_apex = hit_point - apex;
    let height_projection = dot(hit_to_apex, v);
    
    // 축에 수직인 벡터 계산
    let radial_vector = hit_to_apex - v * height_projection;
    let radial_distance = length(radial_vector);
    
    if (radial_distance > 0.001) {
        let radial_direction = radial_vector / radial_distance;
        
        // 원뿔 각도의 코사인 값
        let h = cone.height;
        let r = cone.radius;
        let cos_alpha = h / sqrt(h * h + r * r);
        let sin_alpha = r / sqrt(h * h + r * r);
        
        // 원뿔 표면의 법선 = 반지름 방향 * cos_alpha + 축 방향 * sin_alpha
        let normal = radial_direction * cos_alpha + v * sin_alpha;
        return normalize(normal);
    }
    
    // 축 위에 있는 경우 기본 법선
    return vec3<f32>(0.0, 1.0, 0.0);
}

// BVH AABB intersection test
fn ray_aabb_intersect(ray: Ray, minCorner: vec3<f32>, maxCorner: vec3<f32>) -> f32 {
    // 개선: 노드 프루닝 시 '입구(entry) t' 를 사용해야 가까운 프리미티브를 놓치지 않음.
    // 기존 코드는 내부(origin이 AABB 안)일 때 '나가는 지점 t_far' 를 반환하여
    // 이미 큰 t 를 가진 hit 을 가진 상태에서 이 노드를 잘못 스킵하는 문제가 있었음.
    // (aabb_t > closest_hit.t 조건으로 continue) → 더 가까운 물체가 뒤로 비쳐 보이는 현상.
    let inv_dir = 1.0 / ray.direction;
    let t1 = (minCorner - ray.origin) * inv_dir;
    let t2 = (maxCorner - ray.origin) * inv_dir;
    let t_min_v = min(t1, t2);
    let t_max_v = max(t1, t2);
    let t_near = max(max(t_min_v.x, t_min_v.y), t_min_v.z);
    let t_far  = min(min(t_max_v.x, t_max_v.y), t_max_v.z);
    if (t_near > t_far || t_far < 0.0) { return -1.0; }
    // 박스 안에 있으면 t_near 는 음수 → 0 으로 클램프 (즉, 즉시 도달)
    let entry = select(0.0, t_near, t_near > 0.0);
    return entry;
}

//------------------------------------------------------------------------------
// Bézier evaluation & partials (de Casteljau 2‑D)
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
// Patch split helpers (splitV / subdivide_patch)
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
// Newton iteration refine
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
// Bézier Patch intersection functions
//------------------------------------------------------------------------------

// 베지어 패치 인터섹션 함수 - UV 파라미터도 반환
fn intersect_bezier_patch_with_uv(ray: Ray, bezierPatch: BezierPatch, t_min: f32, t_max: f32) -> vec4<f32> {
    // Coarse AABB reject using patch's stored bounds before subdivision cost
    let entry = ray_aabb_intersect(ray, bezierPatch.minCorner, bezierPatch.maxCorner);
    if (entry < 0.0) { return vec4<f32>(-1.0, 0.0, 0.0, 0.0); }
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