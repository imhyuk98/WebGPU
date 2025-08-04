import structs_shader from "./shaders/structs.wgsl"
import utils_shader from "./shaders/utils.wgsl"
import scene_shader_code from "./shaders/scene.wgsl"
import intersections_shader from "./shaders/intersections.wgsl"
import raytracer_kernel from "./shaders/raytracer_kernel.wgsl"
import screen_shader from "./shaders/screen_shader.wgsl"
import { Material, MaterialType, MaterialTemplates } from "./material";
import { 
    vec3, add, subtract, scale, length, normalize, cross,
    createFrustum, sphereInFrustum, Frustum, BoundingSphere,
    getBoundingSphereForSphere, getBoundingSphereForBox, 
    getBoundingSphereForCylinder, getBoundingSphereForTorus,
    BezierPatch, ControlPointMatrix
} from "./utils";
import { BVHBuilder } from "./bvh/builder";
import { BVHNode } from "./bvh/node";
import { BVHPrimitive } from "./bvh/geometry";

// Re-export for use in other modules
export { BezierPatch, HermiteBezierPatch } from "./utils";

// Data structures for scene objects
export interface Sphere {
    center: vec3;
    radius: number;
    color: vec3;
    material: Material;
}

export interface Cylinder {
    center: vec3; // Center of the cylinder's axis
    axis: vec3;   // Direction of the cylinder's axis (should be normalized)
    height: number;
    radius: number;
    color: vec3;
    material: Material;
}

export interface Box {
    center: vec3;      // 큐브의 중심점
    size: vec3;        // 각 축의 크기 [width, height, depth]
    rotation: vec3;    // 회전 각도 [x, y, z] (라디안)
    color: vec3;       // 색상
    material: Material;
}

export interface Plane {
    center: vec3;
    normal: vec3;      // 평면의 법선 벡터
    size: [number, number];  // [width, height]
    rotation: vec3;    // 평면 회전
    color: vec3;       // 색상
    material: Material;
}

export interface Circle {
    center: vec3;      // 원의 중심점
    radius: number;    // 반지름
    normal: vec3;      // 원이 놓인 평면의 법선
    color: vec3;       // 색상
    material: Material;
}

export interface Ellipse {
    center: vec3;      // 타원의 중심점
    radiusA: number;   // 장축 반지름
    radiusB: number;   // 단축 반지름
    normal: vec3;      // 타원이 놓인 평면의 법선
    rotation: vec3;    // 타원의 회전 각도 [x, y, z] (라디안)
    color: vec3;       // 색상
    material: Material;
}

export interface Line {
    start: vec3;       // 선의 시작점
    end: vec3;         // 선의 끝점
    thickness: number; // 선의 두께
    color: vec3;       // 색상
    material: Material;
}

export interface ConeGeometry {
    center: vec3;      // 원뿔의 밑면 중심점
    axis: vec3;        // 원뿔의 축 방향 (정규화되어야 함)
    height: number;    // 원뿔의 높이
    radius: number;    // 밑면의 반지름
    color: vec3;       // 색상
    material: Material;
}

export interface Torus {
    center: vec3;      // 토러스의 중심점
    rotation: vec3;    // 회전 각도 [x, y, z] (라디안) - 시작 방향 조정
    majorRadius: number; // 주반지름 (중심에서 튜브 중심까지의 거리)
    minorRadius: number; // 부반지름 (튜브의 반지름)
    angle: number;     // 그릴 각도 (라디안, 0부터 시작)
    color: vec3;       // 색상
    material: Material;
}

// Scene 생성 시 사용할 수 있는 degree 버전 인터페이스
export interface TorusInput {
    center: vec3;      // 토러스의 중심점
    rotation?: vec3;   // 회전 각도 [x, y, z] (라디안) - 시작 방향 조정
    majorRadius: number; // 주반지름
    minorRadius: number; // 부반지름
    angleDegree?: number;  // 그릴 각도 (도, 기본값: 360 - 완전한 도넛)
    color: vec3;       // 색상
    material: Material;
}

// Scene containing all objects
export interface Scene {
    spheres: Sphere[];
    cylinders: Cylinder[];
    boxes: Box[];
    planes: Plane[];
    circles: Circle[];
    ellipses: Ellipse[];
    lines: Line[];
    cones: ConeGeometry[];
    toruses: Torus[];
    bezierPatches?: BezierPatch[];
}

// Scene 생성 시 사용할 수 있는 입력용 인터페이스
export interface SceneInput {
    spheres?: Sphere[];
    cylinders?: Cylinder[];
    boxes?: Box[];
    planes?: Plane[];
    circles?: Circle[];
    ellipses?: Ellipse[];
    lines?: Line[];
    cones?: ConeGeometry[];
    toruses?: TorusInput[];
    bezierPatches?: BezierPatch[];
}


export class Renderer {

    canvas: HTMLCanvasElement; // HTML canvas element for rendering

    // Device/Context objects
    adapter: GPUAdapter; // 물리적인 GPU 정보 제공
    device: GPUDevice; // 실제 GPU 작업 수행
    context: GPUCanvasContext; // GPU와 캔버스 연결
    format : GPUTextureFormat; // 렌더링할 때 사용할 텍스처 포맷 (RGB)

    //Assets
    color_buffer: GPUTexture; // Ray tracing 결과를 저장할 2D 이미지
    color_buffer_view: GPUTextureView; // GPU는 텍스처에 접근할 수 없기에 View를 통해 접근
    sampler: GPUSampler; // 텍스처에서 색상을 읽을 때의 방법 정의

    // Pipeline objects
    ray_tracing_pipeline: GPUComputePipeline // Ray tracing 계산을 수행하는 GPU 프로그램
    ray_tracing_bind_group: GPUBindGroup // Ray Tracing에 필요한 리소스를 하나로 묶음 (장면 데이터, 카메라 정보, 설정(샘플링 수, 랜덤 시드 등), 출력 이미지)
    screen_pipeline: GPURenderPipeline // color_buffer(출력 이미지)를 화면에 그리는 GPU 프로그램
    screen_bind_group: GPUBindGroup // 화면 렌더링에 필요한 리소스들을 묶음 (color_buffer_view(결과 이미지), sampler(텍스쳐 읽기 방법))

    // Uniforms
    uniform_buffer: GPUBuffer; // 렌더링 설정값들 저장
    camera_buffer: GPUBuffer; // 카메라 정보 저장 (위치, 방향 등)
    
    // Frustum Culling
    enableFrustumCulling: boolean = false; // BVH 테스트를 위해 임시 비활성화
    originalScene: Scene; // 원본 Scene 저장
    sceneBuffer: GPUBuffer; // Scene 버퍼를 재사용하기 위해 저장
    ray_tracing_bind_group_layout: GPUBindGroupLayout; // BindGroup 레이아웃 저장

    // BVH System
    enableBVH: boolean = true; // BVH 활성화 여부
    bvhBuilder: BVHBuilder; // BVH 빌더
    bvhNodes: BVHNode[] = []; // BVH 노드들
    bvhPrimitiveIndices: number[] = []; // BVH primitive 인덱스들
    bvhBuffer: GPUBuffer; // BVH 노드 버퍼
    primitiveIndexBuffer: GPUBuffer; // Primitive 인덱스 버퍼
    primitiveInfoBuffer: GPUBuffer; // Primitive 타입 정보 버퍼

    // canvas 연결
    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;
        this.bvhBuilder = new BVHBuilder();
    }

   // Initialize now takes a Scene object
   async Initialize(scene: Scene) {

        // 원본 Scene 저장 (Frustum Culling용)
        this.originalScene = scene;

        await this.setupDevice();

        await this.createAssets();
    
        // Pass the scene to makePipeline
        await this.makePipeline(scene);
    }

    // GPU 연결 및 설정
    // adapter -> device -> context -> format 설정
    async setupDevice() {

        //adapter: wrapper around (physical) GPU.
        //Describes features and limits
        this.adapter = <GPUAdapter> await navigator.gpu?.requestAdapter();
        //device: wrapper around GPU functionality
        //Function calls are made through the device
        this.device = <GPUDevice> await this.adapter?.requestDevice();
        //context: similar to vulkan instance (or OpenGL context)
        this.context = <GPUCanvasContext> this.canvas.getContext("webgpu");
        this.format = "bgra8unorm";
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "opaque"
        });

    }

    // GPU 파이프라인과 리소스 구성
    // 카메라 계산 → GPU 명령어 실행 → 화면 출력
    async makePipeline(scene: Scene) {

        // --- Data Packing ---
        const headerSize = 13; // 13 floats for the header (10 counts + 3 padding for 4-byte alignment)
        const sphereStride = 8; // 8 floats per sphere (vec3, float, vec3, float) - already 4-byte aligned
        const cylinderStride = 12; // 12 floats per cylinder based on WGSL struct alignment - already 4-byte aligned
        const boxStride = 16; // 16 floats per box (vec3, vec3, vec3, vec3) - already 4-byte aligned
        const planeStride = 20;  // 20 floats - already 4-byte aligned
        const circleStride = 12; // 12 floats - already 4-byte aligned
        const ellipseStride = 20; // 20 floats - already 4-byte aligned
        const lineStride = 16; // 16 floats - already 4-byte aligned
        const coneStride = 16; // 16 floats (center(3) + padding(1) + axis(3) + height(1) + radius(1) + padding(3) + color(3) + materialType(1))
        const torusStride = 16; // 16 floats - already 4-byte aligned
        const bezierPatchStride = 60; // 16 control points (48 floats) + bounding box (8 floats) + color+material (4 floats)

        const totalSizeInFloats = headerSize + 
                                  scene.spheres.length * sphereStride + 
                                  scene.cylinders.length * cylinderStride + 
                                  scene.boxes.length * boxStride + 
                                  scene.planes.length * planeStride +
                                  scene.circles.length * circleStride +
                                  scene.ellipses.length * ellipseStride +
                                  scene.lines.length * lineStride +
                                  scene.cones.length * coneStride +
                                  scene.toruses.length * torusStride +
                                  (scene.bezierPatches?.length || 0) * bezierPatchStride;
        const sceneData = new Float32Array(totalSizeInFloats);

        // 1. Write header with padding for 4-byte alignment
        sceneData[0] = scene.spheres.length;
        sceneData[1] = scene.cylinders.length;
        sceneData[2] = scene.boxes.length; // 직육면체 개수 추가
        sceneData[3] = scene.planes.length;  // Plane 개수 추가
        sceneData[4] = scene.circles.length; // Circle 개수 추가
        sceneData[5] = scene.ellipses.length; // Ellipse 개수 추가
        sceneData[6] = scene.lines.length; // Line 개수 추가
        sceneData[7] = scene.cones.length; // Cone 개수 추가
        sceneData[8] = scene.toruses.length; // Torus 개수 추가
        sceneData[9] = scene.bezierPatches?.length || 0; // BezierPatch 개수 추가
        console.log(`📦 Header: bezierPatches count = ${sceneData[9]}`);
        sceneData[10] = 0; // padding
        sceneData[11] = 0; // padding
        sceneData[12] = 0; // padding

        // 2. Write sphere data
        let offset = headerSize;
        for (const sphere of scene.spheres) {
            sceneData.set(sphere.center, offset);
            sceneData[offset + 3] = sphere.radius;
            sceneData.set(sphere.color, offset + 4);
            sceneData[offset + 7] = sphere.material.type;
            offset += sphereStride;
        }

        // 3. Write cylinder data
        for (const cylinder of scene.cylinders) {
            const normalized_axis = normalize(cylinder.axis);
            const half_height_vec = scale(normalized_axis, cylinder.height / 2);
            const p1 = subtract(cylinder.center, half_height_vec);
            const p2 = add(cylinder.center, half_height_vec);
            
            // Correctly pack data according to WGSL struct alignment
            // p1: vec3<f32> (offset 0, 3 floats)
            sceneData.set(p1, offset);
            // radius: f32 (offset 3, 1 float)
            sceneData[offset + 3] = cylinder.radius;
            // p2: vec3<f32> (offset 4, 3 floats)
            sceneData.set(p2, offset + 4);
            // color: vec3<f32> (offset 8, 3 floats)
            sceneData.set(cylinder.color, offset + 8);
            // materialType: i32 (offset 11)
            sceneData[offset + 11] = cylinder.material.type;
            offset += cylinderStride;
        }

        // 4. Write box data
        for (const box of scene.boxes) {
            // center: vec3<f32> + padding
            sceneData[offset + 0] = box.center[0];
            sceneData[offset + 1] = box.center[1];
            sceneData[offset + 2] = box.center[2];
            sceneData[offset + 3] = 0; // padding
            
            // size: vec3<f32> + padding (width, height, depth)
            sceneData[offset + 4] = box.size[0];
            sceneData[offset + 5] = box.size[1];
            sceneData[offset + 6] = box.size[2];
            sceneData[offset + 7] = 0; // padding
            
            // rotation: vec3<f32> + padding
            sceneData[offset + 8] = box.rotation[0];
            sceneData[offset + 9] = box.rotation[1];
            sceneData[offset + 10] = box.rotation[2];
            sceneData[offset + 11] = 0; // padding
            
            // color: vec3<f32> + padding
            sceneData[offset + 12] = box.color[0];
            sceneData[offset + 13] = box.color[1];
            sceneData[offset + 14] = box.color[2];
            sceneData[offset + 15] = box.material.type;
            offset += boxStride;
        }

        // Plane 데이터 패킹
        for (const plane of scene.planes) {
            sceneData[offset + 0] = plane.center[0];
            sceneData[offset + 1] = plane.center[1];
            sceneData[offset + 2] = plane.center[2];
            sceneData[offset + 3] = 0; // padding
            sceneData[offset + 4] = plane.normal[0];
            sceneData[offset + 5] = plane.normal[1];
            sceneData[offset + 6] = plane.normal[2];
            sceneData[offset + 7] = 0; // padding
            sceneData[offset + 8] = plane.size[0];
            sceneData[offset + 9] = plane.size[1];
            sceneData[offset + 10] = 0; // padding
            sceneData[offset + 11] = 0; // padding
            sceneData[offset + 12] = plane.rotation[0];
            sceneData[offset + 13] = plane.rotation[1];
            sceneData[offset + 14] = plane.rotation[2];
            sceneData[offset + 15] = 0; // padding
            sceneData[offset + 16] = plane.color[0];
            sceneData[offset + 17] = plane.color[1];
            sceneData[offset + 18] = plane.color[2];
            sceneData[offset + 19] = plane.material.type;
            offset += planeStride;
        }

        // Circle 데이터 패킹
        for (const circle of scene.circles) {
            sceneData[offset + 0] = circle.center[0];
            sceneData[offset + 1] = circle.center[1];
            sceneData[offset + 2] = circle.center[2];
            sceneData[offset + 3] = circle.radius;
            sceneData[offset + 4] = circle.normal[0];
            sceneData[offset + 5] = circle.normal[1];
            sceneData[offset + 6] = circle.normal[2];
            sceneData[offset + 7] = 0; // padding
            sceneData[offset + 8] = circle.color[0];
            sceneData[offset + 9] = circle.color[1];
            sceneData[offset + 10] = circle.color[2];
            sceneData[offset + 11] = circle.material.type;
            offset += circleStride;
        }

        // Ellipse 데이터 패킹
        for (const ellipse of scene.ellipses) {
            sceneData[offset + 0] = ellipse.center[0];
            sceneData[offset + 1] = ellipse.center[1];
            sceneData[offset + 2] = ellipse.center[2];
            sceneData[offset + 3] = 0; // padding
            sceneData[offset + 4] = ellipse.radiusA;
            sceneData[offset + 5] = ellipse.radiusB;
            sceneData[offset + 6] = 0; // padding
            sceneData[offset + 7] = 0; // padding
            sceneData[offset + 8] = ellipse.normal[0];
            sceneData[offset + 9] = ellipse.normal[1];
            sceneData[offset + 10] = ellipse.normal[2];
            sceneData[offset + 11] = 0; // padding
            sceneData[offset + 12] = ellipse.rotation[0];
            sceneData[offset + 13] = ellipse.rotation[1];
            sceneData[offset + 14] = ellipse.rotation[2];
            sceneData[offset + 15] = 0; // padding
            sceneData[offset + 16] = ellipse.color[0];
            sceneData[offset + 17] = ellipse.color[1];
            sceneData[offset + 18] = ellipse.color[2];
            sceneData[offset + 19] = ellipse.material.type;
            offset += ellipseStride;
        }

        // Line 데이터 패킹
        for (const line of scene.lines) {
            sceneData[offset + 0] = line.start[0];
            sceneData[offset + 1] = line.start[1];
            sceneData[offset + 2] = line.start[2];
            sceneData[offset + 3] = 0; // padding
            sceneData[offset + 4] = line.end[0];
            sceneData[offset + 5] = line.end[1];
            sceneData[offset + 6] = line.end[2];
            sceneData[offset + 7] = line.thickness;
            sceneData[offset + 8] = line.color[0];
            sceneData[offset + 9] = line.color[1];
            sceneData[offset + 10] = line.color[2];
            sceneData[offset + 11] = line.material.type;
            sceneData[offset + 12] = 0; // padding
            sceneData[offset + 13] = 0; // padding
            sceneData[offset + 14] = 0; // padding
            sceneData[offset + 15] = 0; // padding
            offset += lineStride;
        }

        // Cone 데이터 패킹 (16 floats for 4-byte alignment)
        for (const cone of scene.cones) {
            sceneData[offset + 0] = cone.center[0];
            sceneData[offset + 1] = cone.center[1];
            sceneData[offset + 2] = cone.center[2];
            sceneData[offset + 3] = 0; // padding
            sceneData[offset + 4] = cone.axis[0];
            sceneData[offset + 5] = cone.axis[1];
            sceneData[offset + 6] = cone.axis[2];
            sceneData[offset + 7] = cone.height;
            sceneData[offset + 8] = cone.radius;
            sceneData[offset + 9] = 0; // padding
            sceneData[offset + 10] = 0; // padding
            sceneData[offset + 11] = 0; // padding
            sceneData[offset + 12] = cone.color[0];
            sceneData[offset + 13] = cone.color[1];
            sceneData[offset + 14] = cone.color[2];
            sceneData[offset + 15] = cone.material.type;
            offset += coneStride;
        }

        // Torus 데이터 패킹
        for (const torus of scene.toruses) {
            sceneData[offset + 0] = torus.center[0];
            sceneData[offset + 1] = torus.center[1];
            sceneData[offset + 2] = torus.center[2];
            sceneData[offset + 3] = 0; // padding
            sceneData[offset + 4] = torus.rotation[0];
            sceneData[offset + 5] = torus.rotation[1];
            sceneData[offset + 6] = torus.rotation[2];
            sceneData[offset + 7] = 0; // padding
            sceneData[offset + 8] = torus.majorRadius;
            sceneData[offset + 9] = torus.minorRadius;
            sceneData[offset + 10] = torus.angle;
            sceneData[offset + 11] = 0; // padding (예전 endAngle 자리)
            sceneData[offset + 12] = torus.color[0];
            sceneData[offset + 13] = torus.color[1];
            sceneData[offset + 14] = torus.color[2];
            sceneData[offset + 15] = torus.material.type;
            offset += torusStride;
        }

        // Bézier patches 데이터 패킹
        if (scene.bezierPatches) {
            console.log(`🔵 Packing ${scene.bezierPatches.length} Bezier patches`);
            console.log(`🎯 Bezier patch starts at absolute offset: ${offset}`);
            for (const patch of scene.bezierPatches) {
                console.log(`📦 Bezier patch: color=${patch.color}, material=${patch.material.type}`);
                console.log(`📦 Bounding box: min=${patch.boundingBox.min}, max=${patch.boundingBox.max}`);
                const patchStartOffset = offset;
                // Pack 16 control points (48 floats)
                // Convert from 4x4 matrix to flat array of 16 points
                for (let row = 0; row < 4; row++) {
                    for (let col = 0; col < 4; col++) {
                        const cp = patch.controlPoints[row][col];
                        const idx = row * 4 + col;
                        sceneData[offset + idx * 3 + 0] = cp[0];
                        sceneData[offset + idx * 3 + 1] = cp[1];
                        sceneData[offset + idx * 3 + 2] = cp[2];
                    }
                }
                offset += 48; // 16 control points * 3 floats each
                console.log(`📦 After control points, offset = ${offset}`);
                
                // Pack bounding box (min and max corners - 8 floats with padding)
                sceneData[offset + 0] = patch.boundingBox.min[0];
                sceneData[offset + 1] = patch.boundingBox.min[1];
                sceneData[offset + 2] = patch.boundingBox.min[2];
                sceneData[offset + 3] = 0; // padding
                sceneData[offset + 4] = patch.boundingBox.max[0];
                sceneData[offset + 5] = patch.boundingBox.max[1];
                sceneData[offset + 6] = patch.boundingBox.max[2];
                sceneData[offset + 7] = 0; // padding
                offset += 8;
                console.log(`📦 After bounding box, offset = ${offset}`);
                
                // Pack color and material (4 floats)
                sceneData[offset + 0] = patch.color[0];
                sceneData[offset + 1] = patch.color[1];
                sceneData[offset + 2] = patch.color[2];
                sceneData[offset + 3] = patch.material.type;
                console.log(`🎨 Packed color at absolute offset ${offset}: [${sceneData[offset + 0]}, ${sceneData[offset + 1]}, ${sceneData[offset + 2]}], material: ${sceneData[offset + 3]}`);
                console.log(`📍 Patch start: ${patchStartOffset}, Control points: ${patchStartOffset}-${patchStartOffset + 47}, Bounding box: ${patchStartOffset + 48}-${patchStartOffset + 55}, Color: ${patchStartOffset + 56}-${patchStartOffset + 59}`);
                offset += 4;
            }
        }

        // Create a storage buffer for the scene data
        this.sceneBuffer = this.device.createBuffer({
            size: Math.max(sceneData.byteLength, 1024 * 1024), // 최소 1MB로 설정
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        
        // Debug: Check buffer content just before writing to GPU
        if (scene.bezierPatches.length > 0) {
            const bezierPatchOffset = offset - 4; // Last packed offset (color start)
            console.log(`🔍 Final buffer check before GPU upload:`);
            console.log(`  Color R at position ${bezierPatchOffset}: ${sceneData[bezierPatchOffset]}`);
            console.log(`  Color G at position ${bezierPatchOffset + 1}: ${sceneData[bezierPatchOffset + 1]}`);
            console.log(`  Color B at position ${bezierPatchOffset + 2}: ${sceneData[bezierPatchOffset + 2]}`);
            console.log(`  Material at position ${bezierPatchOffset + 3}: ${sceneData[bezierPatchOffset + 3]}`);
        }
        
        this.device.queue.writeBuffer(this.sceneBuffer, 0, sceneData);

        // --- BVH Construction ---
        if (this.enableBVH) {
            this.buildBVH(scene);
        }

        // --- Camera Buffer ---
        this.camera_buffer = this.device.createBuffer({
            size: 4 * 16, // 4x vec4<f32> for camera data
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, // UNIFORM : 유니폼 버퍼로 사용 (작은 데이터, 자주 업데이트)
        });

        // --- Uniform Buffer for settings ---
        // samples_per_pixel: 안티앨리어싱용 샘플 수 (예: 100)
        // seed: 랜덤 생성기 시드값 (매 프레임 변경)
        this.uniform_buffer = this.device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 
        });
        // UNIFORM: 작은 데이터(~64KB), 빠른 접근, 모든 스레드가 동일한 값
        // STORAGE: 큰 데이터, 각 스레드가 다른 인덱스 접근 가능

        // WGSL 셰이더 코드를 하나로 합친 문자열
        const full_raytracer_code = `
            ${structs_shader}
            ${utils_shader}
            ${scene_shader_code}
            ${intersections_shader}
            ${raytracer_kernel}
        `;

        this.ray_tracing_bind_group_layout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "rgba8unorm",
                        viewDimension: "2d"
                    }
                },
                {
                    binding: 1, // Scene data
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2, // Settings uniform
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 3, // Camera uniform
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 4, // BVH nodes (if enabled)
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 5, // BVH primitive indices (if enabled)
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 6, // BVH primitive info (type + geometry index)
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });
    
        this.ray_tracing_bind_group = this.device.createBindGroup({
            layout: this.ray_tracing_bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: this.color_buffer_view
                },
                {
                    binding: 1,
                    resource: { buffer: this.sceneBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.uniform_buffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.camera_buffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.bvhBuffer || this.createDummyBuffer() }
                },
                {
                    binding: 5,
                    resource: { buffer: this.primitiveIndexBuffer || this.createDummyBuffer() }
                },
                {
                    binding: 6,
                    resource: { buffer: this.primitiveInfoBuffer || this.createDummyBuffer() }
                }
            ]
        });
        
        const ray_tracing_pipeline_layout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.ray_tracing_bind_group_layout]
        });

        this.ray_tracing_pipeline = this.device.createComputePipeline({
            layout: ray_tracing_pipeline_layout,
            
            compute: {
                module: this.device.createShaderModule({
                code: full_raytracer_code,
            }),
            entryPoint: 'main',
        },
        });

        const screen_bind_group_layout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
            ]

        });

        this.screen_bind_group = this.device.createBindGroup({
            layout: screen_bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource:  this.sampler
                },
                {
                    binding: 1,
                    resource: this.color_buffer_view
                }
            ]
        });

        const screen_pipeline_layout = this.device.createPipelineLayout({
            bindGroupLayouts: [screen_bind_group_layout]
        });

        this.screen_pipeline = this.device.createRenderPipeline({
            layout: screen_pipeline_layout,
            
            vertex: {
                module: this.device.createShaderModule({
                code: screen_shader,
            }),
            entryPoint: 'vert_main',
            },

            fragment: {
                module: this.device.createShaderModule({
                code: screen_shader,
            }),
            entryPoint: 'frag_main',
            targets: [
                {
                    format: "bgra8unorm"
                }
            ]
            },

            primitive: {
                topology: "triangle-list"
            }
        });
        
    }

    // 렌더링에 필요한 GPU Assets 생성
    async createAssets() {
        
        this.color_buffer = this.device.createTexture(
            {
                size: {
                    width: this.canvas.width,
                    height: this.canvas.height,
                },
                format: "rgba8unorm",
                usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
            }
        );

        this.color_buffer_view = this.color_buffer.createView();

        const samplerDescriptor: GPUSamplerDescriptor = {
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1
        };
        this.sampler = this.device.createSampler(samplerDescriptor);
    }

    // Frustum Culling을 적용하여 필터링된 Scene 생성
    performFrustumCulling(
        cameraPos: vec3, 
        lookAt: vec3, 
        up: vec3, 
        fov: number, 
        aspectRatio: number
    ): Scene {
        if (!this.enableFrustumCulling) {
            return this.originalScene;
        }

        // Frustum 생성 (nearPlane과 farPlane은 적절히 설정)
        const nearPlane = 0.1;
        const farPlane = 1000.0;
        const frustum = createFrustum(cameraPos, lookAt, up, fov, aspectRatio, nearPlane, farPlane);

        const culledScene: Scene = {
            spheres: [],
            cylinders: [],
            boxes: [],
            planes: [],
            circles: [],
            ellipses: [],
            lines: [],
            cones: [],
            toruses: [],
            bezierPatches: []
        };

        let totalObjects = 0;
        let culledObjects = 0;

        // Sphere Culling
        for (const sphere of this.originalScene.spheres) {
            totalObjects++;
            const boundingSphere = getBoundingSphereForSphere(sphere.center, sphere.radius);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.spheres.push(sphere);
            } else {
                culledObjects++;
            }
        }

        // Cylinder Culling
        for (const cylinder of this.originalScene.cylinders) {
            totalObjects++;
            const boundingSphere = getBoundingSphereForCylinder(cylinder.center, cylinder.radius, cylinder.height);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.cylinders.push(cylinder);
            } else {
                culledObjects++;
            }
        }

        // Box Culling
        for (const box of this.originalScene.boxes) {
            totalObjects++;
            const boundingSphere = getBoundingSphereForBox(box.center, box.size);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.boxes.push(box);
            } else {
                culledObjects++;
            }
        }

        // Plane Culling (평면은 보통 매우 크므로 보수적으로 처리)
        for (const plane of this.originalScene.planes) {
            totalObjects++;
            // 평면의 크기를 고려한 bounding sphere
            const maxSize = Math.max(plane.size[0], plane.size[1]);
            const boundingSphere = getBoundingSphereForSphere(plane.center, maxSize);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.planes.push(plane);
            } else {
                culledObjects++;
            }
        }

        // Circle Culling
        for (const circle of this.originalScene.circles) {
            totalObjects++;
            const boundingSphere = getBoundingSphereForSphere(circle.center, circle.radius);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.circles.push(circle);
            } else {
                culledObjects++;
            }
        }

        // Ellipse Culling
        for (const ellipse of this.originalScene.ellipses) {
            totalObjects++;
            const maxRadius = Math.max(ellipse.radiusA, ellipse.radiusB);
            const boundingSphere = getBoundingSphereForSphere(ellipse.center, maxRadius);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.ellipses.push(ellipse);
            } else {
                culledObjects++;
            }
        }

        // Line Culling
        for (const line of this.originalScene.lines) {
            totalObjects++;
            // 선의 중점과 길이로 bounding sphere 계산
            const midpoint: vec3 = [
                (line.start[0] + line.end[0]) / 2,
                (line.start[1] + line.end[1]) / 2,
                (line.start[2] + line.end[2]) / 2
            ];
            const lineLength = length(subtract(line.end, line.start));
            const boundingSphere = getBoundingSphereForSphere(midpoint, lineLength / 2);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.lines.push(line);
            } else {
                culledObjects++;
            }
        }

        // Cone Culling
        for (const cone of this.originalScene.cones) {
            totalObjects++;
            // Cone의 높이와 반지름으로 bounding sphere 계산
            const boundingRadius = Math.sqrt((cone.height / 2) * (cone.height / 2) + cone.radius * cone.radius);
            const boundingSphere = getBoundingSphereForSphere(cone.center, boundingRadius);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.cones.push(cone);
            } else {
                culledObjects++;
            }
        }

        // Torus Culling
        for (const torus of this.originalScene.toruses) {
            totalObjects++;
            const boundingSphere = getBoundingSphereForTorus(torus.center, torus.majorRadius, torus.minorRadius);
            if (sphereInFrustum(boundingSphere, frustum)) {
                culledScene.toruses.push(torus);
            } else {
                culledObjects++;
            }
        }

        // Bézier Patch Culling
        if (this.originalScene.bezierPatches) {
            for (const patch of this.originalScene.bezierPatches) {
                totalObjects++;
                // Use bounding box to create conservative bounding sphere
                const center: vec3 = [
                    (patch.boundingBox.min[0] + patch.boundingBox.max[0]) / 2,
                    (patch.boundingBox.min[1] + patch.boundingBox.max[1]) / 2,
                    (patch.boundingBox.min[2] + patch.boundingBox.max[2]) / 2
                ];
                const size = subtract(patch.boundingBox.max, patch.boundingBox.min);
                const radius = length(size) / 2; // Conservative sphere radius
                const boundingSphere = getBoundingSphereForSphere(center, radius);
                if (sphereInFrustum(boundingSphere, frustum)) {
                    if (!culledScene.bezierPatches) culledScene.bezierPatches = [];
                    culledScene.bezierPatches.push(patch);
                } else {
                    culledObjects++;
                }
            }
        }

        // 디버그 정보 출력 (매 프레임마다는 너무 많으니 가끔씩만)
        if (Math.random() < 0.01) { // 1% 확률로 출력
            console.log(`Frustum Culling: ${culledObjects}/${totalObjects} objects culled (${((culledObjects/totalObjects)*100).toFixed(1)}%)`);
        }

        return culledScene;
    }

    // Scene 데이터를 GPU 버퍼에 업데이트
    updateSceneBuffer(scene: Scene) {
        // Scene 데이터 패킹 (기존 makePipeline의 데이터 패킹 로직 사용)
        const headerSize = 13; // 13 floats for Bézier patches
        const sphereStride = 8;
        const cylinderStride = 12;
        const boxStride = 16;
        const planeStride = 20;
        const circleStride = 12;
        const ellipseStride = 20;
        const lineStride = 16;
        const coneStride = 16; // Updated to 16 for 4-byte alignment
        const torusStride = 16;
        const bezierPatchStride = 60; // 16 control points (48 floats) + bounding box (8 floats) + color+material (4 floats)

        const totalSizeInFloats = headerSize + 
                                  scene.spheres.length * sphereStride + 
                                  scene.cylinders.length * cylinderStride + 
                                  scene.boxes.length * boxStride + 
                                  scene.planes.length * planeStride +
                                  scene.circles.length * circleStride +
                                  scene.ellipses.length * ellipseStride +
                                  scene.lines.length * lineStride +
                                  scene.cones.length * coneStride +
                                  scene.toruses.length * torusStride +
                                  (scene.bezierPatches?.length || 0) * bezierPatchStride;
        const sceneData = new Float32Array(totalSizeInFloats);

        // 헤더 작성 (13 floats with padding)
        sceneData[0] = scene.spheres.length;
        sceneData[1] = scene.cylinders.length;
        sceneData[2] = scene.boxes.length;
        sceneData[3] = scene.planes.length;
        sceneData[4] = scene.circles.length;
        sceneData[5] = scene.ellipses.length;
        sceneData[6] = scene.lines.length;
        sceneData[7] = scene.cones.length;
        sceneData[8] = scene.toruses.length;
        sceneData[9] = scene.bezierPatches?.length || 0;
        sceneData[10] = 0; // padding
        sceneData[11] = 0; // padding
        sceneData[12] = 0; // padding

        // 데이터 패킹 (기존 로직과 동일)
        let offset = headerSize;
        
        // Spheres
        for (const sphere of scene.spheres) {
            sceneData.set(sphere.center, offset);
            sceneData[offset + 3] = sphere.radius;
            sceneData.set(sphere.color, offset + 4);
            sceneData[offset + 7] = sphere.material.type;
            offset += sphereStride;
        }

        // Cylinders
        for (const cylinder of scene.cylinders) {
            const normalized_axis = normalize(cylinder.axis);
            const half_height_vec = scale(normalized_axis, cylinder.height / 2);
            const p1 = subtract(cylinder.center, half_height_vec);
            const p2 = add(cylinder.center, half_height_vec);
            
            sceneData.set(p1, offset);
            sceneData[offset + 3] = cylinder.radius;
            sceneData.set(p2, offset + 4);
            sceneData.set(cylinder.color, offset + 8);
            sceneData[offset + 11] = cylinder.material.type;
            offset += cylinderStride;
        }

        // Boxes
        for (const box of scene.boxes) {
            sceneData[offset + 0] = box.center[0];
            sceneData[offset + 1] = box.center[1];
            sceneData[offset + 2] = box.center[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = box.size[0];
            sceneData[offset + 5] = box.size[1];
            sceneData[offset + 6] = box.size[2];
            sceneData[offset + 7] = 0;
            sceneData[offset + 8] = box.rotation[0];
            sceneData[offset + 9] = box.rotation[1];
            sceneData[offset + 10] = box.rotation[2];
            sceneData[offset + 11] = 0;
            sceneData[offset + 12] = box.color[0];
            sceneData[offset + 13] = box.color[1];
            sceneData[offset + 14] = box.color[2];
            sceneData[offset + 15] = box.material.type;
            offset += boxStride;
        }

        // Planes
        for (const plane of scene.planes) {
            sceneData[offset + 0] = plane.center[0];
            sceneData[offset + 1] = plane.center[1];
            sceneData[offset + 2] = plane.center[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = plane.normal[0];
            sceneData[offset + 5] = plane.normal[1];
            sceneData[offset + 6] = plane.normal[2];
            sceneData[offset + 7] = 0;
            sceneData[offset + 8] = plane.size[0];
            sceneData[offset + 9] = plane.size[1];
            sceneData[offset + 10] = 0;
            sceneData[offset + 11] = 0;
            sceneData[offset + 12] = plane.rotation[0];
            sceneData[offset + 13] = plane.rotation[1];
            sceneData[offset + 14] = plane.rotation[2];
            sceneData[offset + 15] = 0;
            sceneData[offset + 16] = plane.color[0];
            sceneData[offset + 17] = plane.color[1];
            sceneData[offset + 18] = plane.color[2];
            sceneData[offset + 19] = plane.material.type;
            offset += planeStride;
        }

        // Circles
        for (const circle of scene.circles) {
            sceneData[offset + 0] = circle.center[0];
            sceneData[offset + 1] = circle.center[1];
            sceneData[offset + 2] = circle.center[2];
            sceneData[offset + 3] = circle.radius;
            sceneData[offset + 4] = circle.normal[0];
            sceneData[offset + 5] = circle.normal[1];
            sceneData[offset + 6] = circle.normal[2];
            sceneData[offset + 7] = 0;
            sceneData[offset + 8] = circle.color[0];
            sceneData[offset + 9] = circle.color[1];
            sceneData[offset + 10] = circle.color[2];
            sceneData[offset + 11] = circle.material.type;
            offset += circleStride;
        }

        // Ellipses
        for (const ellipse of scene.ellipses) {
            sceneData[offset + 0] = ellipse.center[0];
            sceneData[offset + 1] = ellipse.center[1];
            sceneData[offset + 2] = ellipse.center[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = ellipse.radiusA;
            sceneData[offset + 5] = ellipse.radiusB;
            sceneData[offset + 6] = 0;
            sceneData[offset + 7] = 0;
            sceneData[offset + 8] = ellipse.normal[0];
            sceneData[offset + 9] = ellipse.normal[1];
            sceneData[offset + 10] = ellipse.normal[2];
            sceneData[offset + 11] = 0;
            sceneData[offset + 12] = ellipse.rotation[0];
            sceneData[offset + 13] = ellipse.rotation[1];
            sceneData[offset + 14] = ellipse.rotation[2];
            sceneData[offset + 15] = 0;
            sceneData[offset + 16] = ellipse.color[0];
            sceneData[offset + 17] = ellipse.color[1];
            sceneData[offset + 18] = ellipse.color[2];
            sceneData[offset + 19] = ellipse.material.type;
            offset += ellipseStride;
        }

        // Lines
        for (const line of scene.lines) {
            sceneData[offset + 0] = line.start[0];
            sceneData[offset + 1] = line.start[1];
            sceneData[offset + 2] = line.start[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = line.end[0];
            sceneData[offset + 5] = line.end[1];
            sceneData[offset + 6] = line.end[2];
            sceneData[offset + 7] = line.thickness;
            sceneData[offset + 8] = line.color[0];
            sceneData[offset + 9] = line.color[1];
            sceneData[offset + 10] = line.color[2];
            sceneData[offset + 11] = line.material.type;
            sceneData[offset + 12] = 0;
            sceneData[offset + 13] = 0;
            sceneData[offset + 14] = 0;
            sceneData[offset + 15] = 0;
            offset += lineStride;
        }

        // Cones (16 floats with padding for alignment)
        for (const cone of scene.cones) {
            sceneData[offset + 0] = cone.center[0];
            sceneData[offset + 1] = cone.center[1];
            sceneData[offset + 2] = cone.center[2];
            sceneData[offset + 3] = 0; // padding
            sceneData[offset + 4] = cone.axis[0];
            sceneData[offset + 5] = cone.axis[1];
            sceneData[offset + 6] = cone.axis[2];
            sceneData[offset + 7] = cone.height;
            sceneData[offset + 8] = cone.radius;
            sceneData[offset + 9] = 0; // padding
            sceneData[offset + 10] = 0; // padding
            sceneData[offset + 11] = 0; // padding
            sceneData[offset + 12] = cone.color[0];
            sceneData[offset + 13] = cone.color[1];
            sceneData[offset + 14] = cone.color[2];
            sceneData[offset + 15] = cone.material.type;
            offset += coneStride;
        }

        // Toruses
        for (const torus of scene.toruses) {
            sceneData[offset + 0] = torus.center[0];
            sceneData[offset + 1] = torus.center[1];
            sceneData[offset + 2] = torus.center[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = torus.rotation[0];
            sceneData[offset + 5] = torus.rotation[1];
            sceneData[offset + 6] = torus.rotation[2];
            sceneData[offset + 7] = 0;
            sceneData[offset + 8] = torus.majorRadius;
            sceneData[offset + 9] = torus.minorRadius;
            sceneData[offset + 10] = torus.angle;
            sceneData[offset + 11] = 0; // padding (예전 endAngle 자리)
            sceneData[offset + 12] = torus.color[0];
            sceneData[offset + 13] = torus.color[1];
            sceneData[offset + 14] = torus.color[2];
            sceneData[offset + 15] = torus.material.type;
            offset += torusStride;
        }

        // Bézier patches
        if (scene.bezierPatches) {
            for (const patch of scene.bezierPatches) {
                // Pack 16 control points (48 floats)
                // Convert from 4x4 matrix to flat array of 16 points
                for (let row = 0; row < 4; row++) {
                    for (let col = 0; col < 4; col++) {
                        const cp = patch.controlPoints[row][col];
                        const idx = row * 4 + col;
                        sceneData[offset + idx * 3 + 0] = cp[0];
                        sceneData[offset + idx * 3 + 1] = cp[1];
                        sceneData[offset + idx * 3 + 2] = cp[2];
                    }
                }
                offset += 48; // 16 control points * 3 floats each
                
                // Pack bounding box (min and max corners - 8 floats with padding)
                sceneData[offset + 0] = patch.boundingBox.min[0];
                sceneData[offset + 1] = patch.boundingBox.min[1];
                sceneData[offset + 2] = patch.boundingBox.min[2];
                sceneData[offset + 3] = 0; // padding
                sceneData[offset + 4] = patch.boundingBox.max[0];
                sceneData[offset + 5] = patch.boundingBox.max[1];
                sceneData[offset + 6] = patch.boundingBox.max[2];
                sceneData[offset + 7] = 0; // padding
                offset += 8;
                
                // Pack color and material (4 floats)
                sceneData[offset + 0] = patch.color[0];
                sceneData[offset + 1] = patch.color[1];
                sceneData[offset + 2] = patch.color[2];
                sceneData[offset + 3] = patch.material.type;
                offset += 4;
            }
        }

        // 기존 버퍼가 충분히 크면 재사용, 아니면 새로 생성
        if (!this.sceneBuffer || this.sceneBuffer.size < sceneData.byteLength) {
            if (this.sceneBuffer) {
                this.sceneBuffer.destroy();
            }
            this.sceneBuffer = this.device.createBuffer({
                size: Math.max(sceneData.byteLength, 1024 * 1024), // 최소 1MB로 설정
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            
            // BindGroup 업데이트
            this.ray_tracing_bind_group = this.device.createBindGroup({
                layout: this.ray_tracing_bind_group_layout,
                entries: [
                    {
                        binding: 0,
                        resource: this.color_buffer_view
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.sceneBuffer }
                    },
                    {
                        binding: 2,
                        resource: { buffer: this.uniform_buffer }
                    },
                    {
                        binding: 3,
                        resource: { buffer: this.camera_buffer }
                    },
                    {
                        binding: 4,
                        resource: { buffer: this.bvhBuffer || this.createDummyBuffer() }
                    },
                    {
                        binding: 5,
                        resource: { buffer: this.primitiveIndexBuffer || this.createDummyBuffer() }
                    },
                    {
                        binding: 6,
                        resource: { buffer: this.primitiveInfoBuffer || this.createDummyBuffer() }
                    }
                ]
            });
        }
        
        // 데이터 업데이트
        this.device.queue.writeBuffer(this.sceneBuffer, 0, sceneData);

        // BVH 업데이트 (frustum culling된 scene으로)
        if (this.enableBVH) {
            this.buildBVH(scene);
            
            // BVH가 업데이트되었으므로 BindGroup 재생성
            this.ray_tracing_bind_group = this.device.createBindGroup({
                layout: this.ray_tracing_bind_group_layout,
                entries: [
                    {
                        binding: 0,
                        resource: this.color_buffer_view
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.sceneBuffer }
                    },
                    {
                        binding: 2,
                        resource: { buffer: this.uniform_buffer }
                    },
                    {
                        binding: 3,
                        resource: { buffer: this.camera_buffer }
                    },
                    {
                        binding: 4,
                        resource: { buffer: this.bvhBuffer }
                    },
                    {
                        binding: 5,
                        resource: { buffer: this.primitiveIndexBuffer }
                    },
                    {
                        binding: 6,
                        resource: { buffer: this.primitiveInfoBuffer }
                    }
                ]
            });
        }
    }

    render = (look_from: vec3, look_at: vec3, v_up: vec3, v_fov: number, aspect_ratio: number) => {

        // --- Frustum Culling ---
        const culledScene = this.performFrustumCulling(look_from, look_at, v_up, v_fov, aspect_ratio);
        this.updateSceneBuffer(culledScene);

        // --- Camera Calculation ---
        const theta = v_fov * (Math.PI / 180.0);
        const h = Math.tan(theta / 2.0);
        const viewport_height = 2.0 * h;
        const viewport_width = aspect_ratio * viewport_height;

        const w = normalize(subtract(look_from, look_at));
        const u = normalize(cross(v_up, w));
        const v = cross(w, u);

        const origin = look_from;
        const horizontal = scale(u, viewport_width);
        const vertical = scale(v, viewport_height);
        const lower_left_corner = subtract(subtract(subtract(origin, scale(horizontal, 0.5)), scale(vertical, 0.5)), w);

        const cameraData = new Float32Array([
            ...origin, 0.0, // padding
            ...lower_left_corner, 0.0, // padding
            ...horizontal, 0.0, // padding
            ...vertical, 0.0, // padding
        ]);
        this.device.queue.writeBuffer(this.camera_buffer, 0, cameraData);

        // --- Update Uniforms ---
        const samples_per_pixel = 4; // 16 → 4으로 성능 개선 (다중 오브젝트용)
        const seed = Math.random() * 4294967295; // Random u32
        this.device.queue.writeBuffer(this.uniform_buffer, 0, new Uint32Array([samples_per_pixel, seed]));

        const commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();

        const ray_trace_pass : GPUComputePassEncoder = commandEncoder.beginComputePass();
        ray_trace_pass.setPipeline(this.ray_tracing_pipeline);
        ray_trace_pass.setBindGroup(0, this.ray_tracing_bind_group);
        ray_trace_pass.dispatchWorkgroups(
            Math.ceil(this.canvas.width / 16), 
            Math.ceil(this.canvas.height / 16), 1);
        ray_trace_pass.end();

        const textureView : GPUTextureView = this.context.getCurrentTexture().createView();
        const renderpass : GPURenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: {r: 0.5, g: 0.0, b: 0.25, a: 1.0},
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        renderpass.setPipeline(this.screen_pipeline);
        renderpass.setBindGroup(0, this.screen_bind_group);
        renderpass.draw(6, 1, 0, 0);
        
        renderpass.end();
    
        this.device.queue.submit([commandEncoder.finish()]);

    }

    // BVH 구축 메서드
    buildBVH(scene: Scene): void {
        const result = this.bvhBuilder.buildBVH(scene);
        this.bvhNodes = result.nodes;
        this.bvhPrimitiveIndices = result.primitiveIndices;

        // BVH 노드 데이터를 GPU 버퍼로 패킹
        if (this.bvhNodes.length > 0) {
            // 각 노드는 8 floats (minCorner(3) + leftChild(1) + maxCorner(3) + primitiveCount(1))
            const nodeData = new Float32Array(this.bvhNodes.length * 8);
            
            for (let i = 0; i < this.bvhNodes.length; i++) {
                const node = this.bvhNodes[i];
                const offset = i * 8;
                
                nodeData[offset + 0] = node.minCorner[0];
                nodeData[offset + 1] = node.minCorner[1];
                nodeData[offset + 2] = node.minCorner[2];
                nodeData[offset + 3] = node.leftChild;
                nodeData[offset + 4] = node.maxCorner[0];
                nodeData[offset + 5] = node.maxCorner[1];
                nodeData[offset + 6] = node.maxCorner[2];
                nodeData[offset + 7] = node.primitiveCount;
            }

            // BVH 노드 버퍼 생성
            if (this.bvhBuffer) {
                this.bvhBuffer.destroy();
            }
            this.bvhBuffer = this.device.createBuffer({
                size: Math.max(nodeData.byteLength, 16), // 최소 16 bytes
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(this.bvhBuffer, 0, nodeData);
        }

        // Primitive 인덱스 버퍼 생성
        if (this.bvhPrimitiveIndices.length > 0) {
            const indexData = new Uint32Array(this.bvhPrimitiveIndices);
            
            if (this.primitiveIndexBuffer) {
                this.primitiveIndexBuffer.destroy();
            }
            this.primitiveIndexBuffer = this.device.createBuffer({
                size: Math.max(indexData.byteLength, 16), // 최소 16 bytes
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(this.primitiveIndexBuffer, 0, indexData);
        }

        // Primitive 정보 버퍼 생성 (타입 + 지오메트리 인덱스)
        if (result.primitiveInfos.length > 0) {
            // 각 primitive info는 4 uint32 (geometryType, geometryIndex, padding1, padding2)
            const primitiveInfoData = new Uint32Array(result.primitiveInfos.length * 4);
            
            for (let i = 0; i < result.primitiveInfos.length; i++) {
                const info = result.primitiveInfos[i];
                const offset = i * 4;
                
                primitiveInfoData[offset + 0] = info.type;      // geometryType
                primitiveInfoData[offset + 1] = info.index;     // geometryIndex
                primitiveInfoData[offset + 2] = 0;              // padding1
                primitiveInfoData[offset + 3] = 0;              // padding2
            }

            if (this.primitiveInfoBuffer) {
                this.primitiveInfoBuffer.destroy();
            }
            this.primitiveInfoBuffer = this.device.createBuffer({
                size: Math.max(primitiveInfoData.byteLength, 16), // 최소 16 bytes
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(this.primitiveInfoBuffer, 0, primitiveInfoData);
        }

        console.log(`BVH built: ${this.bvhNodes.length} nodes, ${this.bvhPrimitiveIndices.length} primitives`);
    }

    // 더미 버퍼 생성 (BVH가 비활성화된 경우 사용)
    createDummyBuffer(): GPUBuffer {
        return this.device.createBuffer({
            size: 16, // 최소 크기
            usage: GPUBufferUsage.STORAGE,
        });
    }
    
}