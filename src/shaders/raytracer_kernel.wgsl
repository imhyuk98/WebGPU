@group(0) @binding(0) var screen: texture_storage_2d<rgba8unorm, write>;

// The entire scene is in one raw buffer.
@group(0) @binding(1) var<storage, read> scene_buffer: array<f32>;

struct Settings {
    samples_per_pixel: u32,
    seed: u32,
};
@group(0) @binding(2) var<uniform> settings: Settings;

struct Camera {
    origin: vec3<f32>,
    _p1: f32, // padding
    lower_left_corner: vec3<f32>,
    _p2: f32, // padding
    horizontal: vec3<f32>,
    _p3: f32, // padding
    vertical: vec3<f32>,
    _p4: f32, // padding
};
@group(0) @binding(3) var<uniform> camera: Camera;

// A simple pseudo-random number generator
fn pcg(v_in: u32) -> u32 {
    var v = v_in * 747796405u + 2891336453u;
    let word = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
    return (word >> 22u) ^ word;
}

fn random_float(seed: ptr<function, u32>) -> f32 {
    *seed = pcg(*seed);
    return f32(*seed) / f32(0xffffffffu);
}

// Reflect function for mirror materials
fn reflect(v: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
    return v - 2.0 * dot(v, n) * n;
}

// The contents of structs.wgsl, scene.wgsl, and intersections.wgsl will be prepended here by the TypeScript code.

fn trace(r: Ray) -> vec3<f32> {
    var current_ray = r;
    var final_color = vec3<f32>(1.0, 1.0, 1.0); // 누적 색상 (곱셈용)
    
    // 반사를 반복문으로 처리 (재귀 대신) - 성능 최적화
    for (var bounce = 0; bounce < 10; bounce = bounce + 1) { // 다시 10으로 복원
        // Background color (sky gradient)
        let t = current_ray.direction.y * 0.5 + 0.5;
        let bottom_color = vec3<f32>(0.5, 0.7, 1.0);
        let top_color = vec3<f32>(1.0, 1.0, 1.0);
        let background_color = mix(bottom_color, top_color, t);

        var closest_hit: Hit;
        closest_hit.t = 1000000.0;
        closest_hit.color = background_color;
        closest_hit.materialType = -1; // No material initially

        let num_spheres = get_num_spheres();
        for (var i = 0u; i < num_spheres; i = i + 1u) {
            let sphere = get_sphere(i);
            let t_sphere = ray_sphere_intersect(current_ray, sphere);
            if (t_sphere > 0.0 && t_sphere < closest_hit.t) {
                closest_hit.t = t_sphere;
                let hit_point = current_ray.origin + current_ray.direction * t_sphere;
                var normal = normalize(hit_point - sphere.center);
                
                closest_hit.normal = normal;
                closest_hit.color = sphere.color;
                closest_hit.materialType = sphere.materialType;
            }
        }

        let num_cylinders = get_num_cylinders();
        for (var i = 0u; i < num_cylinders; i = i + 1u) {
            let cylinder = get_cylinder(i);
            let t_cylinder = ray_cylinder_intersect(current_ray, cylinder);

            if (t_cylinder > 0.0 && t_cylinder < closest_hit.t) {
                closest_hit.t = t_cylinder;
                let hit_point = current_ray.origin + current_ray.direction * t_cylinder;
                
                let p1 = cylinder.p1;
                let ba = cylinder.p2 - p1;
                let oc = hit_point - p1;
                let baba = dot(ba, ba);
                let y = dot(oc, ba);

                var normal: vec3<f32>;
                if (y < 0.01) {
                    normal = -normalize(ba);
                } else if (y > baba - 0.01) {
                    normal = normalize(ba);
                } else {
                    let p = oc - ba * (y / baba);
                    normal = normalize(p);
                }
                
                closest_hit.normal = normal;
                closest_hit.color = cylinder.color;
                closest_hit.materialType = cylinder.materialType; 
            }
        }

        let num_boxes = get_num_boxes();
        for (var i = 0u; i < num_boxes; i = i + 1u) {
            let box = get_box(i);
            let t_box = ray_box_intersect(current_ray, box);

            if (t_box > 0.0 && t_box < closest_hit.t) {
                closest_hit.t = t_box;
                let hit_point = current_ray.origin + current_ray.direction * t_box;
                
                // 직육면체의 법선 계산
                var box_normal = calculate_box_normal(box, hit_point);
                
                closest_hit.normal = box_normal;
                closest_hit.color = box.color;
                closest_hit.materialType = box.materialType;
            }
        }

        // Plane 검사 추가
        let num_planes = get_num_planes();
        for (var i = 0u; i < num_planes; i = i + 1u) {
            let plane = get_plane(i);
            let t_plane = ray_plane_intersect(current_ray, plane);

            if (t_plane > 0.0 && t_plane < closest_hit.t) {
                closest_hit.t = t_plane;
                let hit_point = current_ray.origin + current_ray.direction * t_plane;
                var plane_normal = calculate_plane_normal(plane, hit_point);
                
                closest_hit.normal = plane_normal;
                closest_hit.color = plane.color;
                closest_hit.materialType = plane.materialType;
            }
        }

        // Circle 검사 추가
        let num_circles = get_num_circles();
        for (var i = 0u; i < num_circles; i = i + 1u) {
            let circle = get_circle(i);
            let t_circle = ray_circle_intersect(current_ray, circle);

            if (t_circle > 0.0 && t_circle < closest_hit.t) {
                closest_hit.t = t_circle;
                let hit_point = current_ray.origin + current_ray.direction * t_circle;
                var circle_normal = calculate_circle_normal(circle, hit_point);
                
                closest_hit.normal = circle_normal;
                closest_hit.color = circle.color;
                closest_hit.materialType = circle.materialType;
            }
        }

        // Ellipse 검사 추가
        let num_ellipses = get_num_ellipses();
        for (var i = 0u; i < num_ellipses; i = i + 1u) {
            let ellipse = get_ellipse(i);
            let t_ellipse = ray_ellipse_intersect(current_ray, ellipse);

            if (t_ellipse > 0.0 && t_ellipse < closest_hit.t) {
                closest_hit.t = t_ellipse;
                let hit_point = current_ray.origin + current_ray.direction * t_ellipse;
                var ellipse_normal = calculate_ellipse_normal(ellipse, hit_point);
                
                closest_hit.normal = ellipse_normal;
                closest_hit.color = ellipse.color;
                closest_hit.materialType = ellipse.materialType;
            }
        }

        // Line 검사 추가
        let num_lines = get_num_lines();
        for (var i = 0u; i < num_lines; i = i + 1u) {
            let line = get_line(i);
            let t_line = ray_line_intersect(current_ray, line);

            if (t_line > 0.0 && t_line < closest_hit.t) {
                closest_hit.t = t_line;
                let hit_point = current_ray.origin + current_ray.direction * t_line;
                var line_normal = calculate_line_normal(line, hit_point);
                
                closest_hit.normal = line_normal;
                closest_hit.color = line.color;
                closest_hit.materialType = line.materialType;
            }
        }

        // 교차점이 있는지 확인
        if (closest_hit.t < 100000.0) {
            let hit_point = current_ray.origin + current_ray.direction * closest_hit.t;
            
            // Material handling
            if (closest_hit.materialType == 1) { // METAL material - 100% reflection
                // 색상 누적 (거울 재질의 색상 적용)
                final_color = final_color * closest_hit.color;
                
                // 더 공격적인 에너지 감쇠로 성능 개선
                let brightness = (final_color.r + final_color.g + final_color.b) / 3.0;
                if (brightness < 0.1) { // 0.05 → 0.1로 더 높임
                    break; // 일찍 종료하여 성능 개선
                }
                
                // 완전한 거울 반사
                let reflected_dir = reflect(current_ray.direction, closest_hit.normal);
                
                // 다음 반사 광선 설정 (더 작은 오프셋으로 성능 개선)
                current_ray.origin = hit_point + closest_hit.normal * 0.005; // 0.01 → 0.005
                current_ray.direction = reflected_dir;
                current_ray.t_min = 0.001;
                current_ray.t_max = 1000.0;
                
                // 반복문 계속 (다음 반사)
            } else {
                // LAMBERTIAN material - diffuse lighting (반사 종료)
                let light_dir = normalize(vec3<f32>(1.0, 1.0, 0.5));
                let diffuse = max(dot(closest_hit.normal, light_dir), 0.2);
                final_color = final_color * closest_hit.color * diffuse;
                break; // 반복문 종료
            }
        } else {
            // 배경에 도달 (반사 종료)
            final_color = final_color * closest_hit.color;
            break; // 반복문 종료
        }
    }
    
    return final_color;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let width = f32(textureDimensions(screen).x);
    let height = f32(textureDimensions(screen).y);

    var accumulated_color = vec3<f32>(0.0, 0.0, 0.0);
    let samples_per_pixel = settings.samples_per_pixel;

    var rng_seed = global_id.x + global_id.y * u32(width) + settings.seed;

    for (var i = 0u; i < samples_per_pixel; i = i + 1u) {
        let rand_x = random_float(&rng_seed) - 0.5;
        let rand_y = random_float(&rng_seed) - 0.5;

        let uv = (vec2<f32>(f32(global_id.x), f32(global_id.y)) + vec2<f32>(rand_x, rand_y)) / vec2<f32>(width, height);

        let ray_direction = normalize(camera.lower_left_corner + uv.x * camera.horizontal + uv.y * camera.vertical - camera.origin);
        
        // 기존 코드를 다음과 같이 수정:
        var ray: Ray;
        ray.origin = camera.origin;
        ray.direction = ray_direction;
        ray.t_min = 0.001;  // 자기 교차 방지를 위한 작은 값
        ray.t_max = 1000.0; // 렌더링할 최대 거리

        accumulated_color += trace(ray);
    }

    let final_color = accumulated_color / f32(samples_per_pixel);

    // Add gamma correction
    let gamma_corrected_color = pow(final_color, vec3<f32>(1.0/2.2));

    textureStore(screen, global_id.xy, vec4<f32>(gamma_corrected_color, 1.0));
}