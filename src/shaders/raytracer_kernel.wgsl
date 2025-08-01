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

// BVH buffers
@group(0) @binding(4) var<storage, read> bvh_buffer: array<f32>;
@group(0) @binding(5) var<storage, read> primitive_index_buffer: array<u32>;
@group(0) @binding(6) var<storage, read> primitive_info_buffer: array<BVHPrimitiveInfo>;

// Debug variable to inspect color values
var<private> debug_color: vec3<f32>;

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

// BVH traversal function
fn trace_bvh(ray: Ray) -> Hit {
    var closest_hit: Hit;
    closest_hit.t = 1000000.0;
    closest_hit.materialType = -1;
    closest_hit.color = vec3<f32>(0.7, 0.8, 1.0); // Light blue background
    closest_hit.normal = vec3<f32>(0.0, 1.0, 0.0); // Default normal
    
    // Stack for BVH traversal (limit depth to prevent overflow)
    var stack: array<u32, 32>;
    var stack_ptr: u32 = 0;
    
    // Start with root node (index 0)
    stack[0] = 0u;
    stack_ptr = 1u;
    
    while (stack_ptr > 0u) {
        // Pop from stack
        stack_ptr = stack_ptr - 1u;
        let node_index = stack[stack_ptr];
        let node = get_bvh_node(node_index);
        
        // Test ray against AABB
        let aabb_t = ray_aabb_intersect(ray, node.minCorner, node.maxCorner);
        if (aabb_t < 0.0 || aabb_t > closest_hit.t) {
            continue; // Skip this node
        }
        
        // Check if this is a leaf node
        if (node.primitiveCount > 0.0) {
            // Leaf node - test primitives
            let first_primitive = u32(node.leftChild);
            let primitive_count = u32(node.primitiveCount);
            
            for (var i = 0u; i < primitive_count; i = i + 1u) {
                let primitive_index = get_primitive_index(first_primitive + i);
                
                // Test intersection based on primitive type
                // Since we're using a unified primitive list, we need to determine
                // which type each primitive is and call the appropriate intersection function
                let hit_result = test_primitive_intersection(ray, primitive_index);
                
                if (hit_result.t > 0.0 && hit_result.t < closest_hit.t) {
                    closest_hit = hit_result;
                }
            }
        } else {
            // Internal node - add children to stack
            let left_child = u32(node.leftChild);
            let right_child = left_child + 1u;
            
            // Add children to stack (right first for left-first traversal)
            if (stack_ptr < 30u) { // Leave some room to prevent overflow
                stack[stack_ptr] = right_child;
                stack_ptr = stack_ptr + 1u;
                stack[stack_ptr] = left_child;
                stack_ptr = stack_ptr + 1u;
            }
        }
    }
    
    return closest_hit;
}

// Test intersection with a primitive by index
fn test_primitive_intersection(ray: Ray, primitive_index: u32) -> Hit {
    var hit: Hit;
    hit.t = -1.0;
    hit.materialType = -1;
    
    // Get primitive info (type and geometry index)
    let primitive_info = primitive_info_buffer[primitive_index];
    let geometry_type = primitive_info.geometryType;
    let geometry_index = primitive_info.geometryIndex;
    
    // Test based on geometry type
    switch (geometry_type) {
        case 0u: { // SPHERE
            let sphere = get_sphere(geometry_index);
            let t = ray_sphere_intersect(ray, sphere);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                hit.normal = normalize(hit_point - sphere.center);
                hit.color = sphere.color;
                hit.materialType = sphere.materialType;
            }
        }
        case 1u: { // CYLINDER
            let cylinder = get_cylinder(geometry_index);
            let t = ray_cylinder_intersect(ray, cylinder);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                // Calculate cylinder normal
                let p1 = cylinder.p1;
                let ba = cylinder.p2 - p1;
                let oc = hit_point - p1;
                let baba = dot(ba, ba);
                let y = dot(oc, ba);
                
                if (y < 0.01) {
                    hit.normal = -normalize(ba);
                } else if (y > baba - 0.01) {
                    hit.normal = normalize(ba);
                } else {
                    let p = oc - ba * (y / baba);
                    hit.normal = normalize(p);
                }
                hit.color = cylinder.color;
                hit.materialType = cylinder.materialType;
            }
        }
        case 2u: { // BOX
            let box = get_box(geometry_index);
            let t = ray_box_intersect(ray, box);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                hit.normal = calculate_box_normal(box, hit_point);
                hit.color = box.color;
                hit.materialType = box.materialType;
            }
        }
        case 3u: { // PLANE
            let plane = get_plane(geometry_index);
            let t = ray_plane_intersect(ray, plane);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                hit.normal = calculate_plane_normal(plane, hit_point);
                hit.color = plane.color;
                hit.materialType = plane.materialType;
            }
        }
        case 4u: { // CIRCLE
            let circle = get_circle(geometry_index);
            let t = ray_circle_intersect(ray, circle);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                hit.normal = calculate_circle_normal(circle, hit_point);
                hit.color = circle.color;
                hit.materialType = circle.materialType;
            }
        }
        case 5u: { // ELLIPSE
            let ellipse = get_ellipse(geometry_index);
            let t = ray_ellipse_intersect(ray, ellipse);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                hit.normal = calculate_ellipse_normal(ellipse, hit_point);
                hit.color = ellipse.color;
                hit.materialType = ellipse.materialType;
            }
        }
        case 6u: { // LINE
            let line = get_line(geometry_index);
            let t = ray_line_intersect(ray, line);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                hit.normal = calculate_line_normal(line, hit_point);
                hit.color = line.color;
                hit.materialType = line.materialType;
            }
        }
        case 7u: { // CONE
            let cone = get_cone(geometry_index);
            let t = ray_cone_intersect(ray, cone);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                hit.normal = calculate_cone_normal(cone, hit_point);
                hit.color = cone.color;
                hit.materialType = cone.materialType;
            }
        }
        case 8u: { // TORUS
            let torus = get_torus(geometry_index);
            let t = ray_torus_intersect(ray, torus);
            if (t > 0.0) {
                hit.t = t;
                let hit_point = ray.origin + ray.direction * t;
                hit.normal = calculate_torus_normal(torus, hit_point);
                hit.color = torus.color;
                hit.materialType = torus.materialType;
            }
        }
        case 9u: { // BEZIER_PATCH
            let bezierPatch = get_bezier_patch(geometry_index);
            
            // 실제 베지어 패치 인터섹션 사용
            let intersection_result = intersect_bezier_patch_with_uv(ray, bezierPatch, 0.001, 1000.0);
            if (intersection_result.w > 0.5) { // 히트
                hit.t = intersection_result.x;
                let hit_point = ray.origin + ray.direction * hit.t;
                
                // 정확한 UV 파라미터로 법선 계산
                let u = intersection_result.y;
                let v = intersection_result.z;
                let surface_normal = calculate_bezier_patch_normal(bezierPatch, u, v);
                
                // 카메라 방향에 따라 법선 방향 조정
                if (dot(surface_normal, ray.direction) > 0.0) {
                    hit.normal = -surface_normal;
                } else {
                    hit.normal = surface_normal;
                }
                
                // Debug: Show the actual color value read from buffer
                hit.color = debug_color;  // This will show what we actually read from the buffer
                hit.materialType = bezierPatch.materialType;
            }
        }
        default: {
            // Unknown geometry type
        }
    }
    
    return hit;
}

fn trace(r: Ray) -> vec3<f32> {
    var current_ray = r;
    var final_color = vec3<f32>(1.0, 1.0, 1.0);
    
    for (var bounce = 0u; bounce < 8u; bounce = bounce + 1u) {
        var closest_hit: Hit;
        closest_hit.t = 100000.0;
        closest_hit.normal = vec3<f32>(0.0, 0.0, 0.0);
        closest_hit.color = vec3<f32>(0.7, 0.8, 1.0); // Light blue background
        closest_hit.materialType = 0; // LAMBERTIAN

        // Use BVH traversal if available
        if (arrayLength(&bvh_buffer) > 0u) {
            closest_hit = trace_bvh(current_ray);
        } else {
            // Fallback to sequential testing for all geometry types
            
            // Spheres
            let num_spheres = get_num_spheres();
            for (var i = 0u; i < num_spheres; i = i + 1u) {
                let sphere = get_sphere(i);
                let t_sphere = ray_sphere_intersect(current_ray, sphere);

                if (t_sphere > 0.0 && t_sphere < closest_hit.t) {
                    closest_hit.t = t_sphere;
                    let hit_point = current_ray.origin + current_ray.direction * t_sphere;
                    let sphere_normal = normalize(hit_point - sphere.center);
                    
                    closest_hit.normal = sphere_normal;
                    closest_hit.color = sphere.color;
                    closest_hit.materialType = sphere.materialType;
                }
            }

            // Cylinders
            let num_cylinders = get_num_cylinders();
            for (var i = 0u; i < num_cylinders; i = i + 1u) {
                let cylinder = get_cylinder(i);
                let t_cylinder = ray_cylinder_intersect(current_ray, cylinder);

                if (t_cylinder > 0.0 && t_cylinder < closest_hit.t) {
                    closest_hit.t = t_cylinder;
                    let hit_point = current_ray.origin + current_ray.direction * t_cylinder;
                    
                    var normal = vec3<f32>(0.0, 0.0, 0.0);
                    
                    // Calculate cylinder center and axis
                    let cylinder_center = (cylinder.p1 + cylinder.p2) * 0.5;
                    let cylinder_axis = normalize(cylinder.p2 - cylinder.p1);
                    let cylinder_height = length(cylinder.p2 - cylinder.p1);
                    
                    let local_hit = hit_point - cylinder_center;
                    
                    // Project hit point onto cylinder axis
                    let axis_projection = dot(local_hit, cylinder_axis);
                    
                    if (abs(axis_projection) > cylinder_height * 0.5) {
                        // Hit on cylinder caps
                        if (axis_projection > 0.0) {
                            normal = cylinder_axis;
                        } else {
                            normal = -cylinder_axis;
                        }
                    } else {
                        // Hit on cylinder side
                        let radial_vec = local_hit - cylinder_axis * axis_projection;
                        normal = normalize(radial_vec);
                    }
                    
                    closest_hit.normal = normal;
                    closest_hit.color = cylinder.color;
                    closest_hit.materialType = cylinder.materialType; 
                }
            }

            // Boxes
            let num_boxes = get_num_boxes();
            for (var i = 0u; i < num_boxes; i = i + 1u) {
                let box = get_box(i);
                let t_box = ray_box_intersect(current_ray, box);

                if (t_box > 0.0 && t_box < closest_hit.t) {
                    closest_hit.t = t_box;
                    let hit_point = current_ray.origin + current_ray.direction * t_box;
                    
                    var box_normal = calculate_box_normal(box, hit_point);
                    
                    closest_hit.normal = box_normal;
                    closest_hit.color = box.color;
                    closest_hit.materialType = box.materialType;
                }
            }

            // Planes
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

            // Circles
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

            // Ellipses
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

            // Lines
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

            // Cones
            let num_cones = get_num_cones();
            for (var i = 0u; i < num_cones; i = i + 1u) {
                let cone = get_cone(i);
                let t_cone = ray_cone_intersect(current_ray, cone);

                if (t_cone > 0.0 && t_cone < closest_hit.t) {
                    closest_hit.t = t_cone;
                    let hit_point = current_ray.origin + current_ray.direction * t_cone;
                    var cone_normal = calculate_cone_normal(cone, hit_point);
                    
                    closest_hit.normal = cone_normal;
                    closest_hit.color = cone.color;
                    closest_hit.materialType = cone.materialType;
                }
            }

            // Torus (most important for 1000 torus scene)
            let num_toruses = get_num_toruses();
            for (var i = 0u; i < num_toruses; i = i + 1u) {
                let torus = get_torus(i);
                let t_torus = ray_torus_intersect(current_ray, torus);

                if (t_torus > 0.0 && t_torus < closest_hit.t) {
                    closest_hit.t = t_torus;
                    let hit_point = current_ray.origin + current_ray.direction * t_torus;
                    var torus_normal = calculate_torus_normal(torus, hit_point);
                    
                    closest_hit.normal = torus_normal;
                    closest_hit.color = torus.color;
                    closest_hit.materialType = torus.materialType;
                }
            }

            // Bézier patches
            let num_bezier_patches = get_num_bezier_patches();
            for (var i = 0u; i < num_bezier_patches; i = i + 1u) {
                let bezierPatch = get_bezier_patch(i);
                let intersection_result = intersect_bezier_patch_with_uv(current_ray, bezierPatch, 0.001, 1000.0);

                if (intersection_result.w > 0.5 && intersection_result.x < closest_hit.t) { // 히트 확인
                    closest_hit.t = intersection_result.x;
                    let hit_point = current_ray.origin + current_ray.direction * closest_hit.t;
                    
                    // 정확한 UV 파라미터로 법선 계산
                    let u = intersection_result.y;
                    let v = intersection_result.z;
                    let surface_normal = calculate_bezier_patch_normal(bezierPatch, u, v);
                    
                    // 카메라 방향에 따라 법선 방향 조정
                    if (dot(surface_normal, current_ray.direction) > 0.0) {
                        closest_hit.normal = -surface_normal;
                    } else {
                        closest_hit.normal = surface_normal;
                    }
                    
                    // Debug: Show the actual color value read from buffer
                    closest_hit.color = debug_color;  // This will show what we actually read from the buffer
                    closest_hit.materialType = bezierPatch.materialType;
                }
            }
        }

        // Check if ray hit anything
        if (closest_hit.t < 100000.0) {
            let hit_point = current_ray.origin + current_ray.direction * closest_hit.t;
            
            // Material handling
            if (closest_hit.materialType == 1) { // METAL material - reflection
                final_color = final_color * closest_hit.color;
                
                // Early termination for performance
                let brightness = (final_color.r + final_color.g + final_color.b) / 3.0;
                if (brightness < 0.1) {
                    break;
                }
                
                // Perfect mirror reflection
                let reflected_dir = reflect(current_ray.direction, closest_hit.normal);
                
                current_ray.origin = hit_point + closest_hit.normal * 0.005;
                current_ray.direction = reflected_dir;
                current_ray.t_min = 0.001;
                current_ray.t_max = 1000.0;
                
            } else {
                // LAMBERTIAN material - diffuse lighting
                let light_dir = normalize(vec3<f32>(1.0, 1.0, 0.5));
                let diffuse = max(dot(closest_hit.normal, light_dir), 0.2);
                final_color = final_color * closest_hit.color * diffuse;
                break;
            }
        } else {
            // Hit background - use a light blue/white gradient
            let background_color = vec3<f32>(0.7, 0.8, 1.0); // Light blue background
            final_color = final_color * background_color;
            break;
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