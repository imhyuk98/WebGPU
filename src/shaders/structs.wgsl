// Structs must match TypeScript layout and WGSL alignment rules.
struct Sphere {
    center: vec3<f32>,
    radius: f32,
    color: vec3<f32>,
    // padding
};

struct Cylinder {
    p1: vec3<f32>,
    radius: f32,
    p2: vec3<f32>,
    // padding
    color: vec3<f32>,
    // padding
};

struct Box {
    center: vec3<f32>,
    padding1: f32,
    size: vec3<f32>,        // width, height, depth (서로 다를 수 있음)
    padding2: f32,
    rotation: vec3<f32>,    // 회전 각도
    padding3: f32,
    color: vec3<f32>,
    padding4: f32,
};

struct Plane {
    center: vec3<f32>,
    padding1: f32,
    normal: vec3<f32>,
    padding2: f32,
    size: vec2<f32>,      // width, height
    padding3: vec2<f32>,  // vec2 뒤에는 vec2 패딩
    rotation: vec3<f32>,
    padding4: f32,
    color: vec3<f32>,
    padding5: f32,
}

struct Ray {
    origin: vec3<f32>,
    direction: vec3<f32>,
    t_min: f32,    // 최소 거리 (자기 교차 방지용)
    t_max: f32,    // 최대 거리 (렌더링 범위 제한)
};

struct Hit {
    t: f32,
    normal: vec3<f32>,
    color: vec3<f32>,
};

struct Interval {
    min: f32,
    max: f32,
};