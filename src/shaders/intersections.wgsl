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

// 회전 변환 함수들 (역회전)
fn inverse_rotate_point(p: vec3<f32>, rotation: vec3<f32>) -> vec3<f32> {
    // 역회전 순서: Z -> Y -> X (원래 회전의 반대 순서)
    let rot_x = rotation_matrix_x(-rotation.x);
    let rot_y = rotation_matrix_y(-rotation.y);
    let rot_z = rotation_matrix_z(-rotation.z);
    let rotation_matrix = rot_x * rot_y * rot_z;
    return rotation_matrix * p;
}

// 정회전 함수
fn rotate_point(p: vec3<f32>, rotation: vec3<f32>) -> vec3<f32> {
    let rot_x = rotation_matrix_x(rotation.x);
    let rot_y = rotation_matrix_y(rotation.y);
    let rot_z = rotation_matrix_z(rotation.z);
    let rotation_matrix = rot_z * rot_y * rot_x;
    return rotation_matrix * p;
}

// 4차 방정식의 근을 구하기 위한 헬퍼 함수들
fn solve_quadratic(a: f32, b: f32, c: f32) -> vec2<f32> {
    let discriminant = b * b - 4.0 * a * c;
    if (discriminant < 0.0) {
        return vec2<f32>(-1.0, -1.0); // 해가 없음
    }
    let sqrt_disc = sqrt(discriminant);
    return vec2<f32>((-b - sqrt_disc) / (2.0 * a), (-b + sqrt_disc) / (2.0 * a));
}

// Ray-Torus intersection (simplified quartic solver)
fn ray_torus_intersect(ray: Ray, torus: Torus) -> f32 {
    // 토러스 로컬 좌표계로 변환
    let ray_orig = inverse_rotate_point(ray.origin - torus.center, torus.rotation);
    let ray_dir = inverse_rotate_point(ray.direction, torus.rotation);
    
    let R1 = torus.majorRadius; // 주반지름
    let r1 = torus.minorRadius; // 부반지름
    
    // Bounding sphere 검사 (성능 최적화)
    let max_radius = R1 + r1;
    let to_center = length(ray_orig);
    if (to_center > max_radius + 10.0) { // 충분히 멀리 있으면 스킵
        return -1.0;
    }
    
    // 4차 방정식 계수 설정 (원본 CUDA 코드에서 가져옴)
    let A1 = dot(ray_dir, ray_dir);
    let B1 = 2.0 * dot(ray_orig, ray_dir);
    let C1 = dot(ray_orig, ray_orig) + R1 * R1 - r1 * r1;
    let D1 = 4.0 * R1 * R1 * (ray_dir.x * ray_dir.x + ray_dir.z * ray_dir.z);
    let E1 = 8.0 * R1 * R1 * (ray_orig.x * ray_dir.x + ray_orig.z * ray_dir.z);
    let F1 = 4.0 * R1 * R1 * (ray_orig.x * ray_orig.x + ray_orig.z * ray_orig.z);
    
    // 4차 방정식: coeff[4]*t^4 + coeff[3]*t^3 + coeff[2]*t^2 + coeff[1]*t + coeff[0] = 0
    let coeff4 = A1 * A1;
    let coeff3 = 2.0 * A1 * B1;
    let coeff2 = 2.0 * A1 * C1 + B1 * B1 - D1;
    let coeff1 = 2.0 * B1 * C1 - E1;
    let coeff0 = C1 * C1 - F1;
    
    // 간단한 케이스: 4차항이 작으면 2차 방정식으로 근사
    if (abs(coeff4) < 0.001) {
        if (abs(coeff2) < 0.001) {
            return -1.0; // 해결할 수 없음
        }
        let quadratic_result = solve_quadratic(coeff2, coeff1, coeff0);
        let t_candidates = array<f32, 2>(quadratic_result.x, quadratic_result.y);
        
        // 가장 가까운 양수 해 찾기
        var closest_t = 100000.0;
        for (var i = 0; i < 2; i = i + 1) {
            let t = t_candidates[i];
            if (t > ray.t_min && t < closest_t) {
                let hit_point = ray_orig + ray_dir * t;
                // 각도 체크
                let angle_rad = torus.degree * (3.14159 / 180.0);
                let theta = atan2(hit_point.z, hit_point.x);
                var normalized_theta = theta;
                if (normalized_theta < 0.0) {
                    normalized_theta = normalized_theta + 2.0 * 3.14159;
                }
                
                if (normalized_theta >= 0.0 && normalized_theta <= angle_rad) {
                    closest_t = t;
                }
            }
        }
        
        if (closest_t < 100000.0) {
            return closest_t;
        }
    }
    
    return -1.0;
}

// Torus 법선 계산
fn calculate_torus_normal(torus: Torus, hit_point: vec3<f32>) -> vec3<f32> {
    // 토러스 로컬 좌표계로 변환
    let local_hit = inverse_rotate_point(hit_point - torus.center, torus.rotation);
    
    let R1 = torus.majorRadius;
    
    // 토러스 법선 계산 (원본 CUDA 코드에서 가져옴)
    let distance_to_center_axis = sqrt(local_hit.x * local_hit.x + local_hit.z * local_hit.z);
    if (distance_to_center_axis < 0.001) {
        return vec3<f32>(0.0, 1.0, 0.0); // 기본 법선
    }
    
    let aa = 1.0 - (R1 / distance_to_center_axis);
    var normal = vec3<f32>(
        aa * local_hit.x,
        local_hit.y,
        aa * local_hit.z
    );
    
    // 월드 좌표계로 다시 변환
    normal = rotate_point(normal, torus.rotation);
    
    return normalize(normal);
}