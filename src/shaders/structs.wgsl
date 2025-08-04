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
    center: vec3<f32>,      // 토러스의 중심점
    padding1: f32,
    rotation: vec3<f32>,    // 회전 각도 (시작 방향 조정)
    padding2: f32,
    majorRadius: f32,       // 주반지름 (R)
    minorRadius: f32,       // 부반지름 (r)
    angle: f32,             // 그릴 각도 (라디안, 0부터 시작)
    padding3: f32,          // padding (예전 endAngle 자리)
    color: vec3<f32>,       // 색상
    materialType: i32,      // 재질 타입
}

struct BezierPatch {
    // Control points stored as 16 consecutive vec3s (4x4 matrix flattened)
    controlPoints: array<vec3<f32>, 16>,
    // Bounding box
    minCorner: vec3<f32>,
    padding1: f32,
    maxCorner: vec3<f32>,
    padding2: f32,
    color: vec3<f32>,
    materialType: i32,
}

struct Cone {
    center: vec3<f32>,      // 원뿔의 꼭짓점
    padding1: f32,
    axis: vec3<f32>,        // 원뿔의 축 방향 (정규화된 벡터)
    height: f32,            // 원뿔의 높이
    radius: f32,            // 원뿔 밑면의 반지름
    padding2: f32,          // 4-byte alignment padding
    padding3: f32,          // 4-byte alignment padding
    padding4: f32,          // 4-byte alignment padding
    color: vec3<f32>,       // 색상
    materialType: i32,      // 재질 타입
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

// BVH Node structure
struct BVHNode {
    minCorner: vec3<f32>,     // AABB minimum corner
    leftChild: f32,           // Left child index (or first primitive index if leaf)
    maxCorner: vec3<f32>,     // AABB maximum corner  
    primitiveCount: f32,      // Number of primitives (0 for internal nodes)
};

// BVH Primitive info structure
struct BVHPrimitiveInfo {
    geometryType: u32,        // 0=Sphere, 1=Cylinder, 2=Box, etc.
    geometryIndex: u32,       // Index within the specific geometry array
    padding1: u32,
    padding2: u32,
};

// Bézier Patch related structures
struct Float3 {
    x: f32,
    y: f32,
    z: f32,
};

struct BezierPatchData {
    // 4×4 control points in row‑major order
    P: array<Float3, 16>,
    b_min: Float3,
    b_max: Float3,
};

struct RayData {
    ori : Float3,
    dir : Float3,
    t_min : f32,
    t_max : f32,
};

struct BezierHit {
    t : f32,
    u : f32,
    v : f32,
    n : Float3,
};

struct BezierEvalResult {
    P: Float3,
    dPu: Float3,
    dPv: Float3,
};

struct AABBResult {
    hit: bool,
    t_enter: f32,
    t_exit: f32,
};

struct NewtonResult {
    converged: bool,
    u: f32,
    v: f32,
    t: f32,
};