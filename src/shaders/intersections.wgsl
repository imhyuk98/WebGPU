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
    var closest_t = -1.0;

    let ro = ray.origin;
    let rd = ray.direction;
    let ca = c.p2 - c.p1;
    let oc = ro - c.p1;
    let caca = dot(ca, ca);
    let card = dot(ca, rd);
    let caoc = dot(ca, oc);
    let a = caca - card * card;
    let b = caca * dot(oc, rd) - caoc * card;
    let c_ = caca * dot(oc, oc) - caoc * caoc - c.radius * c.radius * caca;
    let h = b * b - a * c_;

    // 🔵 기존 측면 교차 검사 (그대로 유지)
    if (h >= 0.0) {
        let sqrt_h = sqrt(h);
        // First root
        let t1 = (-b - sqrt_h) / a;
        let y1 = caoc + t1 * card;
        if (y1 > 0.0 && y1 < caca && t1 >= ray.t_min && t1 <= ray.t_max) {
            closest_t = t1;
        }

        // Second root
        let t2 = (-b + sqrt_h) / a;
        let y2 = caoc + t2 * card;
        if (y2 > 0.0 && y2 < caca && t2 >= ray.t_min && t2 <= ray.t_max) {
            if (closest_t < 0.0 || t2 < closest_t) {
                closest_t = t2;
            }
        }
    }

    // 🔴 뚜껑 검사 추가 (기존 로직 이후에)
    let cylinder_axis = normalize(ca);
    let axis_dot_ray = dot(cylinder_axis, rd);
    
    // 광선이 실린더 축과 평행하지 않은 경우에만 뚜껑 검사
    if (abs(axis_dot_ray) > 0.0001) {
        // 아래쪽 뚜껑 (p1) 검사
        let t_bottom = dot(c.p1 - ro, cylinder_axis) / axis_dot_ray;
        if (t_bottom >= ray.t_min && t_bottom <= ray.t_max) {
            let hit_point = ro + rd * t_bottom;
            let to_hit = hit_point - c.p1;
            let dist_sq = dot(to_hit, to_hit) - pow(dot(to_hit, cylinder_axis), 2.0);
            if (dist_sq <= c.radius * c.radius) {
                if (closest_t < 0.0 || t_bottom < closest_t) {
                    closest_t = t_bottom;
                }
            }
        }
        
        // 위쪽 뚜껑 (p2) 검사
        let t_top = dot(c.p2 - ro, cylinder_axis) / axis_dot_ray;
        if (t_top >= ray.t_min && t_top <= ray.t_max) {
            let hit_point = ro + rd * t_top;
            let to_hit = hit_point - c.p2;
            let dist_sq = dot(to_hit, to_hit) - pow(dot(to_hit, cylinder_axis), 2.0);
            if (dist_sq <= c.radius * c.radius) {
                if (closest_t < 0.0 || t_top < closest_t) {
                    closest_t = t_top;
                }
            }
        }
    }

    return closest_t;
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
    // 회전 행렬 계산
    let rotation_x = rotation_matrix_x(plane.rotation.x);
    let rotation_y = rotation_matrix_y(plane.rotation.y);
    let rotation_z = rotation_matrix_z(plane.rotation.z);
    let rotation_matrix = rotation_z * rotation_y * rotation_x;
    
    // 회전된 법선 벡터
    let world_normal = normalize(rotation_matrix * plane.normal);
    
    // 광선과 평면의 교차 계산
    let denom = dot(world_normal, ray.direction);
    
    // 광선이 평면과 평행한 경우
    if (abs(denom) < 0.0001) {
        return -1.0;
    }
    
    // 교차점까지의 거리 계산
    let t = dot(plane.center - ray.origin, world_normal) / denom;
    
    // t 범위 확인
    if (t < ray.t_min || t > ray.t_max) {
        return -1.0;
    }
    
    // 교차점 계산
    let hit_point = ray.origin + ray.direction * t;
    
    // 교차점이 직사각형 내부에 있는지 확인
    let inverse_rotation = transpose(rotation_matrix);
    let local_hit = inverse_rotation * (hit_point - plane.center);
    
    let half_width = plane.size.x * 0.5;
    let half_height = plane.size.y * 0.5;
    
    // 직사각형 경계 확인 (XY 평면 기준)
    if (abs(local_hit.x) <= half_width && abs(local_hit.y) <= half_height && abs(local_hit.z) < 0.001) {
        return t;
    }
    
    return -1.0;
}

// Plane 법선 계산
fn calculate_plane_normal(plane: Plane, hit_point: vec3<f32>) -> vec3<f32> {
    // 회전 행렬 계산
    let rotation_x = rotation_matrix_x(plane.rotation.x);
    let rotation_y = rotation_matrix_y(plane.rotation.y);
    let rotation_z = rotation_matrix_z(plane.rotation.z);
    let rotation_matrix = rotation_z * rotation_y * rotation_x;
    
    // 회전된 법선 반환
    return normalize(rotation_matrix * plane.normal);
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