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

// The contents of structs.wgsl, scene.wgsl, and intersections.wgsl will be prepended here by the TypeScript code.

fn trace(r: Ray) -> vec3<f32> {
    // Background color (sky gradient)
    let t = r.direction.y * 0.5 + 0.5;
    let bottom_color = vec3<f32>(0.5, 0.7, 1.0);
    let top_color = vec3<f32>(1.0, 1.0, 1.0);
    let background_color = mix(bottom_color, top_color, t);

    var closest_hit: Hit;
    closest_hit.t = 1000000.0;
    closest_hit.color = background_color;

    let num_spheres = get_num_spheres();
    for (var i = 0u; i < num_spheres; i = i + 1u) {
        let sphere = get_sphere(i);
        let t_sphere = ray_sphere_intersect(r, sphere);
        if (t_sphere > 0.0 && t_sphere < closest_hit.t) {
            closest_hit.t = t_sphere;
            let hit_point = r.origin + r.direction * t_sphere;
            closest_hit.normal = normalize(hit_point - sphere.center);
            closest_hit.color = sphere.color;
        }
    }

    let num_cylinders = get_num_cylinders();
    for (var i = 0u; i < num_cylinders; i = i + 1u) {
        let cylinder = get_cylinder(i);
        let t_cylinder = ray_cylinder_intersect(r, cylinder);

        if (t_cylinder > 0.0 && t_cylinder < closest_hit.t) {
            closest_hit.t = t_cylinder;
            let hit_point = r.origin + r.direction * t_cylinder;
            
            let p1 = cylinder.p1;
            let ba = cylinder.p2 - p1;
            let oc = hit_point - p1;
            let baba = dot(ba, ba);
            let y = dot(oc, ba);

            if (y < 0.01) {
                closest_hit.normal = -normalize(ba);
            } else if (y > baba - 0.01) {
                closest_hit.normal = normalize(ba);
            } else {
                let p = oc - ba * (y / baba);
                closest_hit.normal = normalize(p);
            }
            closest_hit.color = cylinder.color; 
        }
    }

    let num_boxes = get_num_boxes();
    for (var i = 0u; i < num_boxes; i = i + 1u) {
        let box = get_box(i);
        let t_box = ray_box_intersect(r, box);

        if (t_box > 0.0 && t_box < closest_hit.t) {
            closest_hit.t = t_box;
            let hit_point = r.origin + r.direction * t_box;
            
            // 직육면체의 법선 계산
            let box_normal = calculate_box_normal(box, hit_point);
            closest_hit.normal = box_normal;
            closest_hit.color = box.color;
        }
    }

    // Plane 검사 추가
    let num_planes = get_num_planes();
    for (var i = 0u; i < num_planes; i = i + 1u) {
        let plane = get_plane(i);
        let t_plane = ray_plane_intersect(r, plane);

        if (t_plane > 0.0 && t_plane < closest_hit.t) {
            closest_hit.t = t_plane;
            let hit_point = r.origin + r.direction * t_plane;
            closest_hit.normal = calculate_plane_normal(plane, hit_point);
            closest_hit.color = plane.color;
        }
    }

    // 만약 어떤 객체와도 교차하지 않았다면 배경색을 반환
    if (closest_hit.t < 100000.0) {
        let light_dir = normalize(vec3<f32>(1.0, 1.0, 0.5));
        let diffuse = max(dot(closest_hit.normal, light_dir), 0.2);
        return closest_hit.color * diffuse;
    }

    return closest_hit.color;
}

@compute @workgroup_size(8, 8, 1)
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