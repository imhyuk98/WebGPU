// Helper functions to read data from the raw buffer
fn get_num_spheres() -> u32 {
    return u32(scene_buffer[0]);
}

fn get_num_cylinders() -> u32 {
    return u32(scene_buffer[1]);
}

fn get_num_boxes() -> u32 {
    return u32(scene_buffer[2]);
}

fn get_num_planes() -> u32 {
    return u32(scene_buffer[3]);  // 헤더의 4번째 요소
}

fn get_num_circles() -> u32 {
    return u32(scene_buffer[4]);  // 헤더의 5번째 요소
}

fn get_num_ellipses() -> u32 {
    return u32(scene_buffer[5]);  // 헤더의 6번째 요소
}

fn get_num_lines() -> u32 {
    return u32(scene_buffer[6]);  // 헤더의 7번째 요소
}

fn get_num_toruses() -> u32 {
    return u32(scene_buffer[7]);  // 헤더의 8번째 요소
}

fn get_sphere(index: u32) -> Sphere {
    let offset = 8u + index * 8u; // Header(8) + previous spheres
    var s: Sphere;
    s.center = vec3<f32>(scene_buffer[offset], scene_buffer[offset + 1], scene_buffer[offset + 2]);
    s.radius = scene_buffer[offset + 3];
    s.color = vec3<f32>(scene_buffer[offset + 4], scene_buffer[offset + 5], scene_buffer[offset + 6]);
    s.materialType = i32(scene_buffer[offset + 7]);
    return s;
}

fn get_cylinder(index: u32) -> Cylinder {
    let num_spheres = get_num_spheres();
    let start_of_cylinders = 8u + num_spheres * 8u;
    let offset = start_of_cylinders + index * 12u; // Use correct stride for cylinders
    var c: Cylinder;
    c.p1 = vec3<f32>(scene_buffer[offset], scene_buffer[offset + 1], scene_buffer[offset + 2]);
    c.radius = scene_buffer[offset + 3];
    c.p2 = vec3<f32>(scene_buffer[offset + 4], scene_buffer[offset + 5], scene_buffer[offset + 6]);
    c.color = vec3<f32>(scene_buffer[offset + 8], scene_buffer[offset + 9], scene_buffer[offset + 10]);
    c.materialType = i32(scene_buffer[offset + 11]);
    return c;
}

fn get_box(index: u32) -> Box {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    
    // Offset calculation: header(8) + spheres + cylinders + boxes
    let offset = 8u + num_spheres * 8u + num_cylinders * 12u + index * 16u;
    
    var box: Box;
    box.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    box.size = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    box.rotation = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
    box.color = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    box.materialType = i32(scene_buffer[offset + 15u]);
    return box;
}

fn get_plane(index: u32) -> Plane {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    
    let offset = 8u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 index * 20u;  // planeStride = 20 (16바이트 단위로 맞춤)
    
    var plane: Plane;
    plane.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    // offset + 3은 padding
    plane.normal = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    // offset + 7은 padding
    plane.size = vec2<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u]);
    // offset + 10, 11은 padding
    plane.rotation = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    // offset + 15는 padding
    plane.color = vec3<f32>(scene_buffer[offset + 16u], scene_buffer[offset + 17u], scene_buffer[offset + 18u]);
    plane.materialType = i32(scene_buffer[offset + 19u]);
    // offset + 20은 padding
    return plane;
}

fn get_circle(index: u32) -> Circle {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    
    let offset = 8u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 20u +
                 index * 12u;  // circleStride = 12
    
    var circle: Circle;
    circle.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    circle.radius = scene_buffer[offset + 3u];
    circle.normal = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    // offset + 7은 padding
    circle.color = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
    circle.materialType = i32(scene_buffer[offset + 11u]);
    // offset + 12는 padding
    return circle;
}

fn get_ellipse(index: u32) -> Ellipse {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    let num_circles = get_num_circles();
    
    let offset = 8u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 20u +
                 num_circles * 12u +
                 index * 20u;  // ellipseStride = 20
    
    var ellipse: Ellipse;
    ellipse.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    // offset + 3은 padding
    ellipse.radiusA = scene_buffer[offset + 4u];
    ellipse.radiusB = scene_buffer[offset + 5u];
    // offset + 6, 7은 padding
    ellipse.normal = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
    // offset + 11은 padding
    ellipse.rotation = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    // offset + 15는 padding
    ellipse.color = vec3<f32>(scene_buffer[offset + 16u], scene_buffer[offset + 17u], scene_buffer[offset + 18u]);
    ellipse.materialType = i32(scene_buffer[offset + 19u]);
    // offset + 20은 padding
    return ellipse;
}

fn get_line(index: u32) -> Line {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    let num_circles = get_num_circles();
    let num_ellipses = get_num_ellipses();
    
    let offset = 8u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 20u +
                 num_circles * 12u +
                 num_ellipses * 20u +
                 index * 16u;  // lineStride = 16
    
    var line: Line;
    line.start = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    // offset + 3은 padding
    line.end = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    line.thickness = scene_buffer[offset + 7u];
    line.color = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
    line.materialType = i32(scene_buffer[offset + 11u]);
    // offset + 12~15는 padding
    return line;
}

fn get_torus(index: u32) -> Torus {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    let num_circles = get_num_circles();
    let num_ellipses = get_num_ellipses();
    let num_lines = get_num_lines();
    
    let offset = 8u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 20u +
                 num_circles * 12u +
                 num_ellipses * 20u +
                 num_lines * 16u +
                 index * 20u;  // torusStride = 20
    
    var torus: Torus;
    torus.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    // offset + 3은 padding
    torus.rotation = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    // offset + 7은 padding
    torus.majorRadius = scene_buffer[offset + 8u];
    torus.minorRadius = scene_buffer[offset + 9u];
    torus.degree = scene_buffer[offset + 10u];
    // offset + 11은 padding
    torus.color = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    torus.materialType = i32(scene_buffer[offset + 15u]);
    // offset + 16~19는 padding
    return torus;
}