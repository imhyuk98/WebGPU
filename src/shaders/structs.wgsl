// Structs must match TypeScript layout and WGSL alignment rules.
struct Sphere {
    center: vec3<f32>,
    radius: f32,
    color: vec3<f32>,
    materialType: i32,
    // padding
};

struct Cylinder {
    p1: vec3<f32>,
    radius: f32,
    p2: vec3<f32>,
    // padding
    color: vec3<f32>,
    materialType: i32,
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
    materialType: i32,
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
    materialType: i32,
    padding5: f32,
}

struct Circle {
    center: vec3<f32>,
    radius: f32,
    normal: vec3<f32>,    // 원이 놓인 평면의 법선
    padding1: f32,
    color: vec3<f32>,
    materialType: i32,
    padding2: f32,
}

struct Ellipse {
    center: vec3<f32>,
    padding1: f32,
    radiusA: f32,         // 장축 반지름
    radiusB: f32,         // 단축 반지름
    padding2: vec2<f32>,
    normal: vec3<f32>,    // 타원이 놓인 평면의 법선
    padding3: f32,
    rotation: vec3<f32>,  // 타원의 회전 각도
    padding4: f32,
    color: vec3<f32>,
    materialType: i32,
    padding5: f32,
}

struct Line {
    start: vec3<f32>,     // 선의 시작점
    padding1: f32,
    end: vec3<f32>,       // 선의 끝점
    thickness: f32,       // 선의 두께
    color: vec3<f32>,     // 색상
    materialType: i32,    // 재질 타입
    padding2: vec4<f32>,  // 16바이트 정렬을 위한 패딩
}

struct Torus {
    center: vec3<f32>,      // 토러스 중심점
    padding1: f32,
    rotation: vec3<f32>,    // 회전 각도
    padding2: f32,
    majorRadius: f32,       // 주반지름 (R1)
    minorRadius: f32,       // 부반지름 (r1)
    degree: f32,            // 각도 (0~360도)
    padding3: f32,
    color: vec3<f32>,       // 색상
    materialType: i32,      // 재질 타입
    padding4: vec4<f32>,    // 16바이트 정렬을 위한 패딩
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
    materialType: i32,
};

struct Interval {
    min: f32,
    max: f32,
};