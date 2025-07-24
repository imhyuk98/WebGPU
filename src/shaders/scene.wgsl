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

fn get_sphere(index: u32) -> Sphere {
    let offset = 4u + index * 8u; // Header + previous spheres
    var s: Sphere;
    s.center = vec3<f32>(scene_buffer[offset], scene_buffer[offset + 1], scene_buffer[offset + 2]);
    s.radius = scene_buffer[offset + 3];
    s.color = vec3<f32>(scene_buffer[offset + 4], scene_buffer[offset + 5], scene_buffer[offset + 6]);
    return s;
}

fn get_cylinder(index: u32) -> Cylinder {
    let num_spheres = get_num_spheres();
    let start_of_cylinders = 4u + num_spheres * 8u;
    let offset = start_of_cylinders + index * 12u; // Use correct stride for cylinders
    var c: Cylinder;
    c.p1 = vec3<f32>(scene_buffer[offset], scene_buffer[offset + 1], scene_buffer[offset + 2]);
    c.radius = scene_buffer[offset + 3];
    c.p2 = vec3<f32>(scene_buffer[offset + 4], scene_buffer[offset + 5], scene_buffer[offset + 6]);
    c.color = vec3<f32>(scene_buffer[offset + 8], scene_buffer[offset + 9], scene_buffer[offset + 10]);
    return c;
}

fn get_box(index: u32) -> Box {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    
    // Offset calculation: header(4) + spheres + cylinders + boxes
    let offset = 4u + num_spheres * 8u + num_cylinders * 12u + index * 16u;
    
    var box: Box;
    box.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    box.size = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    box.rotation = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
    box.color = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    
    return box;
}

fn get_plane(index: u32) -> Plane {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    
    let offset = 4u + 
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
    // offset + 19는 padding
    
    return plane;
}

// scene_data를 scene_buffer로 변경
// fn get_num_spheres() -> u32 {
//     return u32(scene_buffer[0]);
// }

// fn get_num_cylinders() -> u32 {
//     return u32(scene_buffer[1]);
// }

// fn get_num_boxes() -> u32 {
//     return u32(scene_buffer[2]);
// }

// fn get_sphere(index: u32) -> Sphere {
//     let offset = 4u + index * 8u;
//     var sphere: Sphere;
//     sphere.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
//     sphere.radius = scene_buffer[offset + 3u];
//     sphere.color = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
//     return sphere;
// }

// fn get_cylinder(index: u32) -> Cylinder {
//     let num_spheres = get_num_spheres();
//     let offset = 4u + num_spheres * 8u + index * 12u;
//     var cylinder: Cylinder;
//     cylinder.p1 = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
//     cylinder.radius = scene_buffer[offset + 3u];
//     cylinder.p2 = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
//     cylinder.color = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
//     return cylinder;
// }

// fn get_box(index: u32) -> Box {
//     let num_spheres = get_num_spheres();
//     let num_cylinders = get_num_cylinders();
//     let offset = 4u + num_spheres * 8u + num_cylinders * 12u + index * 16u;
    
//     var box: Box;
//     box.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
//     box.size = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
//     box.rotation = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
//     box.color = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    
//     return box;
// }