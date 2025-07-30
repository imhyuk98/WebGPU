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

// Torus SDF (Signed Distance Function) - 뚜껑 없는 열린 도넛
fn torus_sdf(p: vec3<f32>, torus: Torus) -> f32 {
    // 토러스 중심으로 이동
    var pos = p - torus.center;
    
    // 회전 적용 (역회전)
    let rot_x = rotation_matrix_x(-torus.rotation.x);
    let rot_y = rotation_matrix_y(-torus.rotation.y);
    let rot_z = rotation_matrix_z(-torus.rotation.z);
    let rotation_matrix = rot_z * rot_y * rot_x;
    pos = rotation_matrix * pos;
    
    // 표준 토러스 SDF 계산 (뚜껑 없는 완전한 도넛 형태)
    let q = vec2<f32>(length(vec2<f32>(pos.x, pos.z)) - torus.majorRadius, pos.y);
    return length(q) - torus.minorRadius;
}

// 토러스 각도 체크 함수
fn is_point_in_torus_angle_range(point: vec3<f32>, torus: Torus) -> bool {
    // 토러스 중심으로 이동
    var pos = point - torus.center;
    
    // 회전 적용 (역회전)
    let rot_x = rotation_matrix_x(-torus.rotation.x);
    let rot_y = rotation_matrix_y(-torus.rotation.y);
    let rot_z = rotation_matrix_z(-torus.rotation.z);
    let rotation_matrix = rot_z * rot_y * rot_x;
    pos = rotation_matrix * pos;
    
    // XZ 평면에서의 각도 계산
    let angle = atan2(pos.z, pos.x);
    
    // 각도를 0~2π 범위로 정규화
    var normalized_angle = angle;
    if (normalized_angle < 0.0) {
        normalized_angle = normalized_angle + 2.0 * 3.14159265359;
    }
    
    // 단순화된 각도 범위 체크: 0부터 angle까지
    return normalized_angle <= torus.angle;
}

// Ray-Torus intersection using sphere tracing (SDF-based ray marching)
fn ray_torus_intersect(ray: Ray, torus: Torus) -> f32 {
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
    let epsilon = 0.0001;  // 더 작은 epsilon으로 정확도 향상
    
    // 그라디언트 계산 (중앙 차분법)
    let dx = torus_sdf(hit_point + vec3<f32>(epsilon, 0.0, 0.0), torus) - 
             torus_sdf(hit_point - vec3<f32>(epsilon, 0.0, 0.0), torus);
    let dy = torus_sdf(hit_point + vec3<f32>(0.0, epsilon, 0.0), torus) - 
             torus_sdf(hit_point - vec3<f32>(0.0, epsilon, 0.0), torus);
    let dz = torus_sdf(hit_point + vec3<f32>(0.0, 0.0, epsilon), torus) - 
             torus_sdf(hit_point - vec3<f32>(0.0, 0.0, epsilon), torus);
    
    let gradient = vec3<f32>(dx, dy, dz) / (2.0 * epsilon);
    let len = length(gradient);
    
    if (len > 0.0001) {
        return gradient / len;
    } else {
        // 안전한 기본 법선 반환
        return vec3<f32>(0.0, 1.0, 0.0);
    }
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
    // center를 height의 중간점으로 사용
    // 실제 꼭짓점(apex)은 center에서 height/2만큼 아래쪽
    let apex = cone.center - cone.axis * (cone.height * 0.5);
    
    // 원뿔의 꼭짓점을 원점으로 하는 좌표계로 변환
    let oc = ray.origin - apex;  // 광선 원점을 원뿔 기준으로 변환
    let d = ray.direction;       // 광선 방향
    let v = cone.axis;           // 원뿔 축 방향
    
    // 원뿔 각도의 코사인 제곱값 계산 (cos²α = h²/(h²+r²))
    let h = cone.height;
    let r = cone.radius;
    let cos_alpha_sq = (h * h) / (h * h + r * r);
    
    // 2차 방정식의 계수들 계산
    let dv = dot(d, v);
    let ocv = dot(oc, v);
    
    let a = dv * dv - cos_alpha_sq;
    let b = 2.0 * (dv * ocv - dot(d, oc) * cos_alpha_sq);
    let c = ocv * ocv - dot(oc, oc) * cos_alpha_sq;
    
    let discriminant = b * b - 4.0 * a * c;
    
    if (discriminant < 0.0) {
        return -1.0; // 교차점 없음
    }
    
    let sqrt_discriminant = sqrt(discriminant);
    var closest_t = -1.0;
    
    // 두 교차점 확인
    let t1 = (-b - sqrt_discriminant) / (2.0 * a);
    let t2 = (-b + sqrt_discriminant) / (2.0 * a);
    
    // 첫 번째 교차점 확인
    if (t1 >= ray.t_min && t1 <= ray.t_max) {
        let hit_point = ray.origin + d * t1;
        let hit_height = dot(hit_point - apex, v);
        
        // 원뿔의 높이 범위 내에 있는지 확인
        if (hit_height >= 0.0 && hit_height <= h) {
            closest_t = t1;
        }
    }
    
    // 두 번째 교차점 확인 (더 가까운 경우에만)
    if (t2 >= ray.t_min && t2 <= ray.t_max && (closest_t < 0.0 || t2 < closest_t)) {
        let hit_point = ray.origin + d * t2;
        let hit_height = dot(hit_point - apex, v);
        
        if (hit_height >= 0.0 && hit_height <= h) {
            closest_t = t2;
        }
    }
    
    // 밑면과의 교차 검사 (apex에서 height만큼 떨어진 곳)
    let base_normal = v;
    let base_center = apex + v * h;
    let base_denom = dot(d, base_normal);
    
    if (abs(base_denom) > 0.001) {
        let t_base = dot(base_center - ray.origin, base_normal) / base_denom;
        
        if (t_base >= ray.t_min && t_base <= ray.t_max && (closest_t < 0.0 || t_base < closest_t)) {
            let hit_point = ray.origin + d * t_base;
            let distance_from_center = length(hit_point - base_center);
            
            if (distance_from_center <= r) {
                closest_t = t_base;
            }
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