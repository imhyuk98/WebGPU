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
    return u32(scene_buffer[3]); 
}

fn get_num_circles() -> u32 {
    return u32(scene_buffer[4]);
}

fn get_num_ellipses() -> u32 {
    return u32(scene_buffer[5]);
}

fn get_num_lines() -> u32 {
    return u32(scene_buffer[6]);
}

fn get_num_cones() -> u32 {
    return u32(scene_buffer[7]);
}

fn get_num_toruses() -> u32 {
    return u32(scene_buffer[8]);  
}

fn get_num_bezier_patches() -> u32 {
    return u32(scene_buffer[9]);
}

fn get_sphere(index: u32) -> Sphere {
    let offset = 13u + index * 8u; // Header(13) + previous spheres
    var s: Sphere;
    s.center = vec3<f32>(scene_buffer[offset], scene_buffer[offset + 1], scene_buffer[offset + 2]);
    s.radius = scene_buffer[offset + 3];
    s.color = vec3<f32>(scene_buffer[offset + 4], scene_buffer[offset + 5], scene_buffer[offset + 6]);
    s.materialType = i32(scene_buffer[offset + 7]);
    return s;
}

fn get_cylinder(index: u32) -> Cylinder {
    let num_spheres = get_num_spheres();
    let start_of_cylinders = 13u + num_spheres * 8u;
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
    
    // Offset calculation: header(13) + spheres + cylinders + boxes
    let offset = 13u + num_spheres * 8u + num_cylinders * 12u + index * 16u;
    
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
    
    // Updated plane stride = 24 (center(4)+normal(4)+xdir(4)+ydir(4)+size(4)+color(4))
    let offset = 13u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 index * 24u;  
    var plane: Plane;
    plane.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    plane.normal = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    plane.xdir = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
    plane.ydir = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    plane.size = vec2<f32>(scene_buffer[offset + 16u], scene_buffer[offset + 17u]);
    plane.color = vec3<f32>(scene_buffer[offset + 20u], scene_buffer[offset + 21u], scene_buffer[offset + 22u]);
    plane.materialType = i32(scene_buffer[offset + 23u]);
    return plane;
}

fn get_circle(index: u32) -> Circle {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    
    let offset = 13u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 24u +
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
    
    let offset = 13u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 24u +
                 num_circles * 12u +
                 index * 20u;  // ellipseStride = 20
    
    var ellipse: Ellipse;
    ellipse.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    // offset + 3은 padding
    ellipse.radiusA = scene_buffer[offset + 4u];
    ellipse.radiusB = scene_buffer[offset + 5u];
    // offset + 6, 7?� padding
    ellipse.normal = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
    // offset + 11?� padding
    ellipse.rotation = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    // offset + 15??padding
    ellipse.color = vec3<f32>(scene_buffer[offset + 16u], scene_buffer[offset + 17u], scene_buffer[offset + 18u]);
    ellipse.materialType = i32(scene_buffer[offset + 19u]);
    // offset + 20?� padding
    return ellipse;
}

fn get_line(index: u32) -> Line {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    let num_circles = get_num_circles();
    let num_ellipses = get_num_ellipses();
    
    let offset = 13u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 24u +
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

fn get_cone(index: u32) -> Cone {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    let num_circles = get_num_circles();
    let num_ellipses = get_num_ellipses();
    let num_lines = get_num_lines();
    
    let offset = 13u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 24u +
                 num_circles * 12u +
                 num_ellipses * 20u +
                 num_lines * 16u +
                 index * 16u;  // Changed from 13u to 16u for 4-byte alignment  // coneStride = 16
    
    var cone: Cone;
    cone.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    // offset + 3은 padding
    cone.axis = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    cone.height = scene_buffer[offset + 7u];
    cone.radius = scene_buffer[offset + 8u];
    // offset + 9, 10, 11은 padding
    cone.color = vec3<f32>(scene_buffer[offset + 12u], scene_buffer[offset + 13u], scene_buffer[offset + 14u]);
    cone.materialType = i32(scene_buffer[offset + 15u]);
    return cone;
}

fn get_torus(index: u32) -> Torus {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    let num_circles = get_num_circles();
    let num_ellipses = get_num_ellipses();
    let num_lines = get_num_lines();
    let num_cones = get_num_cones();
    
    let offset = 13u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 num_planes * 24u +
                 num_circles * 12u +
                 num_ellipses * 20u +
                 num_lines * 16u +
                 num_cones * 16u +
                 index * 20u;  // torusStride = 20 (center + xdir + ydir + radii/color)
    
    var torus: Torus;
    torus.center = vec3<f32>(scene_buffer[offset + 0u], scene_buffer[offset + 1u], scene_buffer[offset + 2u]);
    // 3 padding
    torus.xdir = vec3<f32>(scene_buffer[offset + 4u], scene_buffer[offset + 5u], scene_buffer[offset + 6u]);
    // 7 padding
    torus.ydir = vec3<f32>(scene_buffer[offset + 8u], scene_buffer[offset + 9u], scene_buffer[offset + 10u]);
    // 11 padding
    torus.majorRadius = scene_buffer[offset + 12u];
    torus.minorRadius = scene_buffer[offset + 13u];
    torus.angle = scene_buffer[offset + 14u];
    // 15 padding
    torus.color = vec3<f32>(scene_buffer[offset + 16u], scene_buffer[offset + 17u], scene_buffer[offset + 18u]);
    torus.materialType = i32(scene_buffer[offset + 19u]);
    return torus;
}

fn get_bezier_patch(index: u32) -> BezierPatch {
    let num_spheres = get_num_spheres();
    let num_cylinders = get_num_cylinders();
    let num_boxes = get_num_boxes();
    let num_planes = get_num_planes();
    let num_circles = get_num_circles();
    let num_ellipses = get_num_ellipses();
    let num_lines = get_num_lines();
    let num_cones = get_num_cones();
    let num_toruses = get_num_toruses();
    
    let offset = 13u + 
                 num_spheres * 8u + 
                 num_cylinders * 12u + 
                 num_boxes * 16u + 
                 // FIX: plane stride updated from 20u -> 24u (center+normal+xdir+ydir+size+color)
                 num_planes * 24u +
                 num_circles * 12u +
                 num_ellipses * 20u +
                 num_lines * 16u +
                 num_cones * 16u +
                 // torus stride updated from 16u -> 20u (center + xdir + ydir + radii/angle + color/material)
                 num_toruses * 20u +
                 index * 60u;  // bezierPatchStride = 60 (16 control points (48) + bounding box (8) + color+material (4))
    
    var bezierPatch: BezierPatch;
    
    // Read 16 control points (each is 3 floats)
    for (var i = 0u; i < 16u; i = i + 1u) {
        let cpOffset = offset + i * 3u;
        bezierPatch.controlPoints[i] = vec3<f32>(
            scene_buffer[cpOffset],
            scene_buffer[cpOffset + 1u],
            scene_buffer[cpOffset + 2u]
        );
    }
    
    // Read bounding box and other properties
    let propOffset = offset + 48u; // 16 * 3 = 48 floats for control points
    bezierPatch.minCorner = vec3<f32>(scene_buffer[propOffset], scene_buffer[propOffset + 1u], scene_buffer[propOffset + 2u]);
    // propOffset + 3 is padding
    bezierPatch.maxCorner = vec3<f32>(scene_buffer[propOffset + 4u], scene_buffer[propOffset + 5u], scene_buffer[propOffset + 6u]);
    // propOffset + 7 is padding
    
    // Color is at propOffset + 8 (after 8 floats of bounding box)
    let colorOffset = propOffset + 8u;
    let colorFromBuffer = vec3<f32>(scene_buffer[colorOffset], scene_buffer[colorOffset + 1u], scene_buffer[colorOffset + 2u]);
    bezierPatch.color = colorFromBuffer;
    bezierPatch.materialType = i32(scene_buffer[colorOffset + 3u]);
    
    // Now use the actual color instead of debug info
    debug_color = colorFromBuffer;
    
    return bezierPatch;
}

// BVH access functions
fn get_bvh_node(index: u32) -> BVHNode {
    let offset = index * 8u; // Each node is 8 floats
    var node: BVHNode;
    node.minCorner = vec3<f32>(bvh_buffer[offset], bvh_buffer[offset + 1u], bvh_buffer[offset + 2u]);
    node.leftChild = bvh_buffer[offset + 3u];
    node.maxCorner = vec3<f32>(bvh_buffer[offset + 4u], bvh_buffer[offset + 5u], bvh_buffer[offset + 6u]);
    node.primitiveCount = bvh_buffer[offset + 7u];
    return node;
}

fn get_primitive_index(index: u32) -> u32 {
    return primitive_index_buffer[index];
}
