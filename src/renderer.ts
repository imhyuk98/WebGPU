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
import { BVHBuilder, BVHStats } from "./bvh/builder";
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
    xdir?: vec3;       // 선택적 X tangent 방향 (정규화)
    ydir?: vec3;       // 선택적 Y tangent 방향 (정규화)
    rotation: vec3;    // (deprecated) 회전 - basis 직접 전달 시 무시
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
    center: vec3;      // 중심
    xdir: vec3;        // 링 진행 방향 기준 X (주반지름 방향)
    ydir: vec3;        // 튜브 단면 업 벡터
    majorRadius: number;
    minorRadius: number;
    angle: number;     // sweep (radians)
    color: vec3;
    material: Material;
}

// Scene 생성 시 사용할 수 있는 degree 버전 인터페이스
export interface TorusInput {
    center: vec3;
    // basis seed (optional). If omitted we choose canonical axes.
    xdir?: vec3;
    ydir?: vec3;
    majorRadius: number;
    minorRadius: number;
    angleDegree?: number;  // sweep degrees
    color: vec3;
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
    // Accumulation (ping-pong)
    accum_textures: (GPUTexture | null)[] = [null, null]; // 누적 결과 (rgba16float) 2개
    accum_views: (GPUTextureView | null)[] = [null, null];
    frameCounter: number = 0; // 지금까지 누적된 프레임 수 (현재 프레임 제외)
    cameraChangedThisFrame: boolean = true;
    private lastAccumPrevIndex: number = -1; // 마지막으로 BindGroup에 사용한 prev 인덱스

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
    sceneBuffer: GPUBuffer | null = null; // 재사용 가능한 Scene 버퍼 (nullable)
    private sceneBufferDevice: GPUDevice | null = null; // 버퍼 생성한 디바이스 추적
    private sceneBufferCapacity: number = 0; // 현재 할당 용량(bytes)
    private bvhBufferCapacity: number = 0;
    private primitiveIndexBufferCapacity: number = 0;
    private primitiveInfoBufferCapacity: number = 0;
    private dummyBuffer: GPUBuffer | null = null;
    ray_tracing_bind_group_layout: GPUBindGroupLayout; // BindGroup 레이아웃 저장

    // BVH System
    enableBVH: boolean = true; // BVH 활성화 여부
    private currentScene: Scene | null = null; // 마지막 로드한 씬 (BVH 토글용)
    bvhBuilder: BVHBuilder; // BVH 빌더
    bvhNodes: BVHNode[] = []; // BVH 노드들
    bvhPrimitiveIndices: number[] = []; // BVH primitive 인덱스들
    bvhBuffer: GPUBuffer; // BVH 노드 버퍼
    primitiveIndexBuffer: GPUBuffer; // Primitive 인덱스 버퍼
    primitiveInfoBuffer: GPUBuffer; // Primitive 타입 정보 버퍼
    private lastBVHStats: BVHStats | null = null;
    private useBVHThisFrame: boolean = true; // auto fallback 결과 반영
    private _lastCamFrom: vec3 | null = null;
    private _lastCamAt: vec3 | null = null;
    private _accumulatedStillFrames: number = 0;
    private lastSceneHash: number = 0; // 이전 프레임의 scene 데이터 해시
    private sceneChangedThisFrame: boolean = false; // Scene 변경 여부
    // Adaptive sampling configuration
    private adaptiveSPPEnabled: boolean = true;
    // Smoother adaptive SPP ramp: small increments to reduce sudden frame time jumps.
    private adaptiveSchedule: { still: number, spp: number }[] = [
        { still: 0,   spp: 1 },
        { still: 20,  spp: 2 },
        { still: 50,  spp: 3 },
        { still: 90,  spp: 4 },
        { still: 140, spp: 5 },
        { still: 200, spp: 6 },
        { still: 260, spp: 7 },
        { still: 330, spp: 8 },
    ];
    private minAdaptiveSPP: number = 1;
    private maxAdaptiveSPP: number = 8;
    private lastSPPUsed: number = 1;
    private sppHysteresisDownFactor: number = 0.5; // when motion resumes, drop to at least 50% previous

    // canvas 연결
    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;
        this.bvhBuilder = new BVHBuilder();
    }

    // 모든 관련 GPU 버퍼/텍스처 상태에 맞춰 Ray Tracing BindGroup을 재생성
    private rebuildRayTracingBindGroup(prevView?: GPUTextureView, nextView?: GPUTextureView) {
        // sceneBuffer나 다른 필수 버퍼가 아직 없다면 스킵
        if (!this.sceneBuffer || !this.uniform_buffer || !this.camera_buffer || !this.color_buffer_view) return;
        const bvhBuf = this.bvhBuffer || this.getDummyBuffer();
        const primIndexBuf = this.primitiveIndexBuffer || this.getDummyBuffer();
        const primInfoBuf = this.primitiveInfoBuffer || this.getDummyBuffer();

        // prev/next 미지정 시 현재 frameCounter 기준 ping-pong 선택
        let autoPrev: GPUTextureView | undefined;
        let autoNext: GPUTextureView | undefined;
        if (!prevView || !nextView) {
            const pIdx = this.frameCounter % 2;
            const nIdx = (pIdx + 1) % 2;
            autoPrev = this.accum_views[pIdx] ?? undefined;
            autoNext = this.accum_views[nIdx] ?? undefined;
            if (autoPrev && autoNext) {
                prevView = prevView ?? autoPrev;
                nextView = nextView ?? autoNext;
                this.lastAccumPrevIndex = pIdx;
            }
        }

        // 전달된 prev/next 없으면 color_buffer_view fallback (초기화 단계)
        const _prev = prevView ?? this.color_buffer_view;
        const _next = nextView ?? this.color_buffer_view;
        this.ray_tracing_bind_group = this.device.createBindGroup({
            layout: this.ray_tracing_bind_group_layout,
            entries: [
                { binding: 0, resource: this.color_buffer_view },
                { binding: 1, resource: { buffer: this.sceneBuffer } },
                { binding: 2, resource: { buffer: this.uniform_buffer } },
                { binding: 3, resource: { buffer: this.camera_buffer } },
                { binding: 4, resource: { buffer: bvhBuf } },
                { binding: 5, resource: { buffer: primIndexBuf } },
                { binding: 6, resource: { buffer: primInfoBuf } },
                { binding: 7, resource: _prev },
                { binding: 8, resource: _next }
            ]
        });
    }

    private computeAdaptiveSPP(): number {
        if (!this.adaptiveSPPEnabled) return this.minAdaptiveSPP;
        const still = this._accumulatedStillFrames;
        let chosen = this.minAdaptiveSPP;
        for (let i = 0; i < this.adaptiveSchedule.length; i++) {
            const step = this.adaptiveSchedule[i];
            if (still >= step.still) chosen = step.spp; else break;
        }
        if (chosen < this.minAdaptiveSPP) chosen = this.minAdaptiveSPP;
        if (chosen > this.maxAdaptiveSPP) chosen = this.maxAdaptiveSPP;
        // Prevent sudden +>2 jumps per frame
        if (chosen > this.lastSPPUsed + 2) chosen = this.lastSPPUsed + 2;
        return chosen;
    }

   // Initialize now takes a Scene object
   async Initialize(scene: Scene) {
        // 디바이스/자산 최초 1회만 생성
        if (!this.device) {
            await this.setupDevice();
            await this.createAssets();
        }
        this.originalScene = scene;
        this.currentScene = scene;
        // 새 씬으로 전환 시 누적 초기화
        this.frameCounter = 0;
        this.cameraChangedThisFrame = true;
        this.lastAccumPrevIndex = -1;
        this.clearAccumulation();
        await this.makePipeline(scene);
    }

    private clearAccumulation() {
        if (!this.device || !this.accum_textures[0]) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const pixelBytes = 8; // rgba16float = 4*16bit = 8 bytes
        const zero = new Uint8Array(Math.min(1024 * 1024, w * h * pixelBytes)); // chunk buffer (1MB max)
        for (let t = 0; t < 2; t++) {
            const tex = this.accum_textures[t];
            if (!tex) continue;
            // 큰 텍스처를 chunk로 채우기 (행 단위)
            const rowBytes = w * pixelBytes;
            const rowsPerChunk = Math.max(1, Math.floor(zero.byteLength / rowBytes));
            let y = 0;
            while (y < h) {
                const writeRows = Math.min(rowsPerChunk, h - y);
                this.device.queue.writeTexture(
                    { texture: tex, origin: { x: 0, y, z: 0 } },
                    zero,
                    { bytesPerRow: rowBytes, rowsPerImage: writeRows },
                    { width: w, height: writeRows, depthOrArrayLayers: 1 }
                );
                y += writeRows;
            }
        }
    }

    // GPU 연결 및 설정
    // adapter -> device -> context -> format 설정
    async setupDevice() {
        if (this.device) return; // 이미 초기화됨
        this.adapter = <GPUAdapter> await navigator.gpu?.requestAdapter();
        this.device = <GPUDevice> await this.adapter?.requestDevice();
        this.context = <GPUCanvasContext> this.canvas.getContext("webgpu");
        this.format = "bgra8unorm";
        this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });
    }

    // GPU 파이프라인과 리소스 구성
    // 카메라 계산 → GPU 명령어 실행 → 화면 출력
    async makePipeline(scene: Scene) {

        // --- Data Packing ---
        const headerSize = 13; // 13 floats for the header (10 counts + 3 padding for 4-byte alignment)
        const sphereStride = 8; // 8 floats per sphere (vec3, float, vec3, float) - already 4-byte aligned
        const cylinderStride = 12; // 12 floats per cylinder based on WGSL struct alignment - already 4-byte aligned
        const boxStride = 16; // 16 floats per box (vec3, vec3, vec3, vec3) - already 4-byte aligned
    const planeStride = 24;  // 24 floats (center(4)+normal(4)+xdir(4)+ydir(4)+size(4)+color(4))
        const circleStride = 12; // 12 floats - already 4-byte aligned
        const ellipseStride = 20; // 20 floats - already 4-byte aligned
        const lineStride = 16; // 16 floats - already 4-byte aligned
        const coneStride = 16; // 16 floats (center(3) + padding(1) + axis(3) + height(1) + radius(1) + padding(3) + color(3) + materialType(1))
    const torusStride = 20; // 20 floats (center+xdir+ydir+radii/angle+color)
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
    // console.log(`📦 Header: bezierPatches count = ${sceneData[9]}`); // DEBUG disabled for perf
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

        // 3. Write cylinder data (center, radius, axis, halfHeight, color, material)
        for (const cylinder of scene.cylinders) {
            const axisN = normalize(cylinder.axis);
            const halfH = cylinder.height * 0.5;
            // center (0..2)
            sceneData[offset + 0] = cylinder.center[0];
            sceneData[offset + 1] = cylinder.center[1];
            sceneData[offset + 2] = cylinder.center[2];
            // radius (3)
            sceneData[offset + 3] = cylinder.radius;
            // axis (4..6)
            sceneData[offset + 4] = axisN[0];
            sceneData[offset + 5] = axisN[1];
            sceneData[offset + 6] = axisN[2];
            // halfHeight (7)
            sceneData[offset + 7] = halfH;
            // color (8..10)
            sceneData[offset + 8] = cylinder.color[0];
            sceneData[offset + 9] = cylinder.color[1];
            sceneData[offset + 10] = cylinder.color[2];
            // material (11)
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
            const n = normalize(plane.normal);
            let xdir = plane.xdir ? [...plane.xdir] as vec3 : undefined;
            let ydir = plane.ydir ? [...plane.ydir] as vec3 : undefined;
            const origX = xdir ? [...xdir] : undefined;
            const origY = ydir ? [...ydir] : undefined;

            // 1. Build / orthogonalize xdir
            if (!xdir || Math.hypot(xdir[0],xdir[1],xdir[2]) < 1e-6) {
                if (Math.abs(n[1]) > 0.9) {
                    // Horizontal plane: lock x axis to world +X for stable rotation
                    xdir = [1,0,0];
                } else {
                    // Pick axis least aligned with n
                    const ref: vec3 = Math.abs(n[0]) < Math.abs(n[2]) ? [1,0,0] : [0,0,1];
                    const dp = ref[0]*n[0]+ref[1]*n[1]+ref[2]*n[2];
                    xdir = [ref[0]-n[0]*dp, ref[1]-n[1]*dp, ref[2]-n[2]*dp] as vec3;
                }
            }
            // Make xdir orthogonal & normalize
            let dpx = xdir[0]*n[0]+xdir[1]*n[1]+xdir[2]*n[2];
            xdir = normalize([xdir[0]-n[0]*dpx, xdir[1]-n[1]*dpx, xdir[2]-n[2]*dpx] as vec3);

            // 2. Build / orthogonalize ydir
            if (!ydir || Math.hypot(ydir[0],ydir[1],ydir[2]) < 1e-6) {
                // Right-handed: ydir = cross(n, xdir)
                ydir = normalize([ n[1]*xdir[2]-n[2]*xdir[1], n[2]*xdir[0]-n[0]*xdir[2], n[0]*xdir[1]-n[1]*xdir[0] ] as vec3);
            } else {
                let dpn = ydir[0]*n[0]+ydir[1]*n[1]+ydir[2]*n[2];
                let tmp: vec3 = [ydir[0]-n[0]*dpn, ydir[1]-n[1]*dpn, ydir[2]-n[2]*dpn];
                let dpx2 = tmp[0]*xdir[0]+tmp[1]*xdir[1]+tmp[2]*xdir[2];
                ydir = normalize([tmp[0]-xdir[0]*dpx2, tmp[1]-xdir[1]*dpx2, tmp[2]-xdir[2]*dpx2] as vec3);
            }

            // 3. Canonicalize orientation for horizontal planes: enforce +Z for ydir
            if (Math.abs(n[1]) > 0.9 && ydir[2] < 0) {
                xdir = [-xdir[0], -xdir[1], -xdir[2]] as vec3;
                ydir = [-ydir[0], -ydir[1], -ydir[2]] as vec3; // keep right-handed
            }

            // 4. Ensure right-handedness (cross(xdir, ydir) ~ n)
            const c = [ xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0] ];
            if ((c[0]*n[0]+c[1]*n[1]+c[2]*n[2]) < 0) {
                ydir = [-ydir[0], -ydir[1], -ydir[2]] as vec3;
            }

            if (typeof (window as any) !== 'undefined' && (window as any).DEBUG_PLANE_BASIS) {
                // console.log(`[PlanePack:init] ...`); // disabled
            }

            sceneData[offset + 0] = plane.center[0];
            sceneData[offset + 1] = plane.center[1];
            sceneData[offset + 2] = plane.center[2];
            sceneData[offset + 3] = 0; // padding
            sceneData[offset + 4] = n[0];
            sceneData[offset + 5] = n[1];
            sceneData[offset + 6] = n[2];
            sceneData[offset + 7] = 0; // padding
            sceneData[offset + 8] = xdir[0];
            sceneData[offset + 9] = xdir[1];
            sceneData[offset + 10] = xdir[2];
            sceneData[offset + 11] = 0; // padding
            sceneData[offset + 12] = ydir[0];
            sceneData[offset + 13] = ydir[1];
            sceneData[offset + 14] = ydir[2];
            sceneData[offset + 15] = 0; // padding
            sceneData[offset + 16] = plane.size[0];
            sceneData[offset + 17] = plane.size[1];
            sceneData[offset + 18] = 0; // padding
            sceneData[offset + 19] = 0; // padding
            sceneData[offset + 20] = plane.color[0];
            sceneData[offset + 21] = plane.color[1];
            sceneData[offset + 22] = plane.color[2];
            sceneData[offset + 23] = plane.material.type;
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

        // Cone 데이터 패킹 (stride 16) + 파생값(invHeight, cosAlpha, sinAlpha) 사전 계산
        for (const cone of scene.cones) {
            const h = cone.height;
            const r = cone.radius;
            const invH = h !== 0 ? 1.0 / h : 0.0;
            const hyp = Math.hypot(h, r); // sqrt(h^2 + r^2)
            const cosAlpha = hyp !== 0 ? h / hyp : 1.0; // 안정성 처리
            const sinAlpha = hyp !== 0 ? r / hyp : 0.0;
            sceneData[offset + 0] = cone.center[0];
            sceneData[offset + 1] = cone.center[1];
            sceneData[offset + 2] = cone.center[2];
            sceneData[offset + 3] = 0; // padding (unused)
            sceneData[offset + 4] = cone.axis[0];
            sceneData[offset + 5] = cone.axis[1];
            sceneData[offset + 6] = cone.axis[2];
            sceneData[offset + 7] = h;
            sceneData[offset + 8] = r;
            sceneData[offset + 9] = invH;
            sceneData[offset + 10] = cosAlpha;
            sceneData[offset + 11] = sinAlpha;
            sceneData[offset + 12] = cone.color[0];
            sceneData[offset + 13] = cone.color[1];
            sceneData[offset + 14] = cone.color[2];
            sceneData[offset + 15] = cone.material.type;
            offset += coneStride;
        }

        // Torus 데이터 패킹 (plane과 동일한 robust basis 정규화/우수성 유지)
        for (const torus of scene.toruses) {
            let xdir = torus.xdir ? [...torus.xdir] as vec3 : undefined;
            let ydir = torus.ydir ? [...torus.ydir] as vec3 : undefined;
            const origX = xdir ? [...xdir] : undefined;
            const origY = ydir ? [...ydir] : undefined;

            // 0. 둘 다 없으면 canonical
            if (!xdir && !ydir) xdir = [1,0,0];
            if (!xdir && ydir) {
                // xdir 생성: ydir과 덜 평행한 ref 선택 후 직교화
                const ref: vec3 = Math.abs(ydir[0]) < 0.9 ? [1,0,0] : [0,0,1];
                let dp = ref[0]*ydir[0]+ref[1]*ydir[1]+ref[2]*ydir[2];
                xdir = [ref[0]-ydir[0]*dp, ref[1]-ydir[1]*dp, ref[2]-ydir[2]*dp] as vec3;
            }
            if (!ydir && xdir) {
                const ref: vec3 = Math.abs(xdir[0]) < 0.9 ? [1,0,0] : [0,1,0];
                let dp = ref[0]*xdir[0]+ref[1]*xdir[1]+ref[2]*xdir[2];
                ydir = [ref[0]-xdir[0]*dp, ref[1]-xdir[1]*dp, ref[2]-xdir[2]*dp] as vec3;
            }

            // 1. xdir 정규화 / degeneracy 처리
            if (!xdir || Math.hypot(xdir[0],xdir[1],xdir[2]) < 1e-6) xdir = [1,0,0];
            else xdir = normalize(xdir);

            // 2. ydir 직교화 → 정규화 (없거나 퇴화 시 cross 기반)
            if (!ydir || Math.hypot(ydir[0],ydir[1],ydir[2]) < 1e-6) {
                // create via cross with a ref not parallel to xdir
                const ref: vec3 = Math.abs(xdir[1]) < 0.9 ? [0,1,0] : [0,0,1];
                const c: vec3 = [xdir[1]*ref[2]-xdir[2]*ref[1], xdir[2]*ref[0]-xdir[0]*ref[2], xdir[0]*ref[1]-xdir[1]*ref[0]];
                let Lc = Math.hypot(c[0],c[1],c[2]);
                ydir = Lc < 1e-6 ? [0,1,0] : [c[0]/Lc, c[1]/Lc, c[2]/Lc];
            } else {
                let dpx = xdir[0]*ydir[0]+xdir[1]*ydir[1]+xdir[2]*ydir[2];
                ydir = [ydir[0]-xdir[0]*dpx, ydir[1]-xdir[1]*dpx, ydir[2]-xdir[2]*dpx] as vec3;
                let Ly = Math.hypot(ydir[0],ydir[1],ydir[2]);
                if (Ly < 1e-6) {
                    ydir = [0,1,0];
                    if (Math.abs(xdir[1]) > 0.9) ydir = [1,0,0];
                } else ydir = [ydir[0]/Ly, ydir[1]/Ly, ydir[2]/Ly];
            }

            // 3. normal 및 right-handed 보정
            let n: vec3 = [ xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0] ];
            let Ln = Math.hypot(n[0],n[1],n[2]);
            if (Ln < 1e-6) { // 재시도
                const ref: vec3 = Math.abs(xdir[0]) < 0.9 ? [1,0,0] : [0,1,0];
                ydir = normalize([ref[0]-xdir[0]*(xdir[0]*ref[0]+xdir[1]*ref[1]+xdir[2]*ref[2]), ref[1]-xdir[1]*(xdir[0]*ref[0]+xdir[1]*ref[1]+xdir[2]*ref[2]), ref[2]-xdir[2]*(xdir[0]*ref[0]+xdir[1]*ref[1]+xdir[2]*ref[2])] as vec3);
                n = [ xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0] ];
                Ln = Math.hypot(n[0],n[1],n[2]);
            }
            if (Ln > 1e-6) n = [n[0]/Ln, n[1]/Ln, n[2]/Ln]; else n = [0,1,0];

            // 4. 수평( normal ~ Y ) 안정화: plane과 유사, ydir이 +Z 쪽 향하도록 (시각적 일관성)
            if (Math.abs(n[1]) > 0.9 && ydir[2] < 0) {
                xdir = [-xdir[0], -xdir[1], -xdir[2]] as vec3;
                ydir = [-ydir[0], -ydir[1], -ydir[2]] as vec3;
            }

            // 5. right-handed: cross(xdir, ydir) ≈ n, 아니라면 ydir 뒤집기
            const c2 = [ xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0] ];
            if (c2[0]*n[0]+c2[1]*n[1]+c2[2]*n[2] < 0) {
                ydir = [-ydir[0], -ydir[1], -ydir[2]] as vec3;
            }

            if (typeof (window as any) !== 'undefined' && (window as any).DEBUG_TORUS_BASIS) {
                const dotXY = (xdir[0]*ydir[0]+xdir[1]*ydir[1]+xdir[2]*ydir[2]).toFixed(4);
                // console.log(`[TorusPack:init] ...`); // disabled
            }
            sceneData[offset + 0] = torus.center[0];
            sceneData[offset + 1] = torus.center[1];
            sceneData[offset + 2] = torus.center[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = xdir[0];
            sceneData[offset + 5] = xdir[1];
            sceneData[offset + 6] = xdir[2];
            sceneData[offset + 7] = 0;
            sceneData[offset + 8] = ydir[0];
            sceneData[offset + 9] = ydir[1];
            sceneData[offset + 10] = ydir[2];
            sceneData[offset + 11] = 0;
            sceneData[offset + 12] = torus.majorRadius;
            sceneData[offset + 13] = torus.minorRadius;
            sceneData[offset + 14] = torus.angle;
            sceneData[offset + 15] = 0;
            sceneData[offset + 16] = torus.color[0];
            sceneData[offset + 17] = torus.color[1];
            sceneData[offset + 18] = torus.color[2];
            sceneData[offset + 19] = torus.material.type;
            offset += torusStride;
        }

        // Bézier patches 데이터 패킹
        if (scene.bezierPatches) {
            // console.log(`🔵 Packing ${scene.bezierPatches.length} Bezier patches`);
            // console.log(`🎯 Bezier patch starts at absolute offset: ${offset}`);
            for (const patch of scene.bezierPatches) {
                // console.log(`📦 Bezier patch info ...`);
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
                // console.log(`📦 After control points, offset = ${offset}`);
                
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
                // console.log(`📦 After bounding box, offset = ${offset}`);
                
                // Pack color and material (4 floats)
                sceneData[offset + 0] = patch.color[0];
                sceneData[offset + 1] = patch.color[1];
                sceneData[offset + 2] = patch.color[2];
                sceneData[offset + 3] = patch.material.type;
                // console.log(`🎨 Packed color ...`);
                offset += 4;
            }
        }

        // Create or reuse storage buffer for the scene data (initial build path) with tracking
        if (!this.sceneBuffer || this.sceneBufferDevice !== this.device || this.sceneBufferCapacity < sceneData.byteLength || (this.sceneBufferCapacity & 3) !== 0) {
            if (this.sceneBuffer) { try { this.sceneBuffer.destroy(); } catch {} }
            let newCap = Math.max(sceneData.byteLength, 1024 * 1024);
            newCap = (newCap + 255) & ~255; // 256-byte align
            this.sceneBuffer = this.device.createBuffer({
                size: newCap,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.sceneBufferDevice = this.device;
            this.sceneBufferCapacity = newCap;
        }
        
        // Debug: Check buffer content just before writing to GPU
        if (scene.bezierPatches.length > 0) {
            const bezierPatchOffset = offset - 4; // Last packed offset (color start)
            // console.log(`🔍 Final buffer check before GPU upload (disabled)`);
        }
        
    this.device.queue.writeBuffer(this.sceneBuffer, 0, sceneData);

        // --- Scene Hash (초기) ---
        this.lastSceneHash = this.computeSceneHash(sceneData);
        this.sceneChangedThisFrame = true; // 초기 생성은 변경으로 간주

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
            size: 24, // + useBVH flag (u32) => 6*4 bytes
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
                },
                { // previous accumulation (sampled)
                    binding: 7,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // next accumulation (write-only storage texture)
                    binding: 8,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: "rgba16float", viewDimension: "2d" }
                }
            ]
        });
    
    this.rebuildRayTracingBindGroup();
        
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

        // Accumulation textures (ping-pong)
        for (let i = 0; i < 2; i++) {
            this.accum_textures[i] = this.device.createTexture({
                size: { width: this.canvas.width, height: this.canvas.height },
                format: 'rgba16float',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
            });
            this.accum_views[i] = this.accum_textures[i]!.createView();
        }
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
            // console.log(`Frustum Culling: ... disabled`);
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
    const planeStride = 24; // updated plane stride (center+normal+xdir+ydir+size+color)
        const circleStride = 12;
        const ellipseStride = 20;
        const lineStride = 16;
        const coneStride = 16; // Updated to 16 for 4-byte alignment
    const torusStride = 20; // center(4)+xdir(4)+ydir(4)+radii/angle(4)+color/material(4)
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

        // Cylinders (center, radius, axis, halfHeight, color, material)
        for (const cylinder of scene.cylinders) {
            const axisN = normalize(cylinder.axis);
            const halfH = cylinder.height * 0.5;
            sceneData[offset + 0] = cylinder.center[0];
            sceneData[offset + 1] = cylinder.center[1];
            sceneData[offset + 2] = cylinder.center[2];
            sceneData[offset + 3] = cylinder.radius;
            sceneData[offset + 4] = axisN[0];
            sceneData[offset + 5] = axisN[1];
            sceneData[offset + 6] = axisN[2];
            sceneData[offset + 7] = halfH;
            sceneData[offset + 8] = cylinder.color[0];
            sceneData[offset + 9] = cylinder.color[1];
            sceneData[offset + 10] = cylinder.color[2];
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

        // Planes (with xdir/ydir basis)
        for (const plane of scene.planes) {
            const n = normalize(plane.normal);
            let xdir = plane.xdir ? [...plane.xdir] as vec3 : undefined;
            let ydir = plane.ydir ? [...plane.ydir] as vec3 : undefined;
            const origX = xdir ? [...xdir] : undefined;
            const origY = ydir ? [...ydir] : undefined;

            if (!xdir || Math.hypot(xdir[0],xdir[1],xdir[2]) < 1e-6) {
                if (Math.abs(n[1]) > 0.9) {
                    xdir = [1,0,0];
                } else {
                    const ref: vec3 = Math.abs(n[0]) < Math.abs(n[2]) ? [1,0,0] : [0,0,1];
                    const dp = ref[0]*n[0]+ref[1]*n[1]+ref[2]*n[2];
                    xdir = [ref[0]-n[0]*dp, ref[1]-n[1]*dp, ref[2]-n[2]*dp] as vec3;
                }
            }
            let dpx = xdir[0]*n[0]+xdir[1]*n[1]+xdir[2]*n[2];
            xdir = normalize([xdir[0]-n[0]*dpx, xdir[1]-n[1]*dpx, xdir[2]-n[2]*dpx] as vec3);

            if (!ydir || Math.hypot(ydir[0],ydir[1],ydir[2]) < 1e-6) {
                ydir = normalize([ n[1]*xdir[2]-n[2]*xdir[1], n[2]*xdir[0]-n[0]*xdir[2], n[0]*xdir[1]-n[1]*xdir[0] ] as vec3);
            } else {
                let dpn = ydir[0]*n[0]+ydir[1]*n[1]+ydir[2]*n[2];
                let tmp: vec3 = [ydir[0]-n[0]*dpn, ydir[1]-n[1]*dpn, ydir[2]-n[2]*dpn];
                let dpx2 = tmp[0]*xdir[0]+tmp[1]*xdir[1]+tmp[2]*xdir[2];
                ydir = normalize([tmp[0]-xdir[0]*dpx2, tmp[1]-xdir[1]*dpx2, tmp[2]-xdir[2]*dpx2] as vec3);
            }

            if (Math.abs(n[1]) > 0.9 && ydir[2] < 0) {
                xdir = [-xdir[0], -xdir[1], -xdir[2]] as vec3;
                ydir = [-ydir[0], -ydir[1], -ydir[2]] as vec3;
            }

            const c = [ xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0] ];
            if ((c[0]*n[0]+c[1]*n[1]+c[2]*n[2]) < 0) {
                ydir = [-ydir[0], -ydir[1], -ydir[2]] as vec3;
            }
            if (typeof (window as any) !== 'undefined' && (window as any).DEBUG_PLANE_BASIS) {
                // console.log(`[PlanePack:update] ...`);
            }
            sceneData[offset + 0] = plane.center[0];
            sceneData[offset + 1] = plane.center[1];
            sceneData[offset + 2] = plane.center[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = n[0];
            sceneData[offset + 5] = n[1];
            sceneData[offset + 6] = n[2];
            sceneData[offset + 7] = 0;
            sceneData[offset + 8] = xdir[0];
            sceneData[offset + 9] = xdir[1];
            sceneData[offset + 10] = xdir[2];
            sceneData[offset + 11] = 0;
            sceneData[offset + 12] = ydir[0];
            sceneData[offset + 13] = ydir[1];
            sceneData[offset + 14] = ydir[2];
            sceneData[offset + 15] = 0;
            sceneData[offset + 16] = plane.size[0];
            sceneData[offset + 17] = plane.size[1];
            sceneData[offset + 18] = 0;
            sceneData[offset + 19] = 0;
            sceneData[offset + 20] = plane.color[0];
            sceneData[offset + 21] = plane.color[1];
            sceneData[offset + 22] = plane.color[2];
            sceneData[offset + 23] = plane.material.type;
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

        // Cones (stride 16) + 파생값(invHeight, cosAlpha, sinAlpha)
        for (const cone of scene.cones) {
            const h = cone.height;
            const r = cone.radius;
            const invH = h !== 0 ? 1.0 / h : 0.0;
            const hyp = Math.hypot(h, r);
            const cosAlpha = hyp !== 0 ? h / hyp : 1.0;
            const sinAlpha = hyp !== 0 ? r / hyp : 0.0;
            sceneData[offset + 0] = cone.center[0];
            sceneData[offset + 1] = cone.center[1];
            sceneData[offset + 2] = cone.center[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = cone.axis[0];
            sceneData[offset + 5] = cone.axis[1];
            sceneData[offset + 6] = cone.axis[2];
            sceneData[offset + 7] = h;
            sceneData[offset + 8] = r;
            sceneData[offset + 9] = invH;
            sceneData[offset + 10] = cosAlpha;
            sceneData[offset + 11] = sinAlpha;
            sceneData[offset + 12] = cone.color[0];
            sceneData[offset + 13] = cone.color[1];
            sceneData[offset + 14] = cone.color[2];
            sceneData[offset + 15] = cone.material.type;
            offset += coneStride;
        }

        // Toruses (plane-style robust basis)
        for (const torus of scene.toruses) {
            let xdir = torus.xdir ? [...torus.xdir] as vec3 : undefined;
            let ydir = torus.ydir ? [...torus.ydir] as vec3 : undefined;
            if (!xdir && !ydir) xdir = [1,0,0];
            if (!xdir && ydir) {
                const ref: vec3 = Math.abs(ydir[0]) < 0.9 ? [1,0,0] : [0,0,1];
                let dp = ref[0]*ydir[0]+ref[1]*ydir[1]+ref[2]*ydir[2];
                xdir = [ref[0]-ydir[0]*dp, ref[1]-ydir[1]*dp, ref[2]-ydir[2]*dp] as vec3;
            }
            if (!ydir && xdir) {
                const ref: vec3 = Math.abs(xdir[0]) < 0.9 ? [1,0,0] : [0,1,0];
                let dp = ref[0]*xdir[0]+ref[1]*xdir[1]+ref[2]*xdir[2];
                ydir = [ref[0]-xdir[0]*dp, ref[1]-xdir[1]*dp, ref[2]-xdir[2]*dp] as vec3;
            }
            if (!xdir || Math.hypot(xdir[0],xdir[1],xdir[2]) < 1e-6) xdir = [1,0,0]; else xdir = normalize(xdir);
            if (!ydir || Math.hypot(ydir[0],ydir[1],ydir[2]) < 1e-6) {
                const ref: vec3 = Math.abs(xdir[1]) < 0.9 ? [0,1,0] : [0,0,1];
                const c: vec3 = [xdir[1]*ref[2]-xdir[2]*ref[1], xdir[2]*ref[0]-xdir[0]*ref[2], xdir[0]*ref[1]-xdir[1]*ref[0]];
                let Lc = Math.hypot(c[0],c[1],c[2]);
                ydir = Lc < 1e-6 ? [0,1,0] : [c[0]/Lc, c[1]/Lc, c[2]/Lc];
            } else {
                let dpx = xdir[0]*ydir[0]+xdir[1]*ydir[1]+xdir[2]*ydir[2];
                ydir = [ydir[0]-xdir[0]*dpx, ydir[1]-xdir[1]*dpx, ydir[2]-xdir[2]*dpx] as vec3;
                let Ly = Math.hypot(ydir[0],ydir[1],ydir[2]);
                if (Ly < 1e-6) ydir = [0,1,0]; else ydir = [ydir[0]/Ly, ydir[1]/Ly, ydir[2]/Ly];
            }
            let n: vec3 = [ xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0] ];
            let Ln = Math.hypot(n[0],n[1],n[2]);
            if (Ln < 1e-6) {
                const ref: vec3 = Math.abs(xdir[0]) < 0.9 ? [1,0,0] : [0,1,0];
                ydir = normalize([ref[0]-xdir[0]*(xdir[0]*ref[0]+xdir[1]*ref[1]+xdir[2]*ref[2]), ref[1]-xdir[1]*(xdir[0]*ref[0]+xdir[1]*ref[1]+xdir[2]*ref[2]), ref[2]-xdir[2]*(xdir[0]*ref[0]+xdir[1]*ref[1]+xdir[2]*ref[2])] as vec3);
                n = [ xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0] ];
                Ln = Math.hypot(n[0],n[1],n[2]);
            }
            if (Ln > 1e-6) n = [n[0]/Ln, n[1]/Ln, n[2]/Ln];
            if (Math.abs(n[1]) > 0.9 && ydir[2] < 0) {
                xdir = [-xdir[0], -xdir[1], -xdir[2]] as vec3;
                ydir = [-ydir[0], -ydir[1], -ydir[2]] as vec3;
            }
            const c2 = [ xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0] ];
            if (c2[0]*n[0]+c2[1]*n[1]+c2[2]*n[2] < 0) ydir = [-ydir[0], -ydir[1], -ydir[2]] as vec3;
            sceneData[offset + 0] = torus.center[0];
            sceneData[offset + 1] = torus.center[1];
            sceneData[offset + 2] = torus.center[2];
            sceneData[offset + 3] = 0;
            sceneData[offset + 4] = xdir[0];
            sceneData[offset + 5] = xdir[1];
            sceneData[offset + 6] = xdir[2];
            sceneData[offset + 7] = 0;
            sceneData[offset + 8] = ydir[0];
            sceneData[offset + 9] = ydir[1];
            sceneData[offset + 10] = ydir[2];
            sceneData[offset + 11] = 0;
            sceneData[offset + 12] = torus.majorRadius;
            sceneData[offset + 13] = torus.minorRadius;
            sceneData[offset + 14] = torus.angle;
            sceneData[offset + 15] = 0;
            sceneData[offset + 16] = torus.color[0];
            sceneData[offset + 17] = torus.color[1];
            sceneData[offset + 18] = torus.color[2];
            sceneData[offset + 19] = torus.material.type;
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

        // 기존 버퍼 재사용 (디바이스/용량 확인)
        if (!this.sceneBuffer || this.sceneBufferDevice !== this.device || this.sceneBufferCapacity < sceneData.byteLength) {
            if (this.sceneBuffer) { try { this.sceneBuffer.destroy(); } catch {} }
            const newCap = Math.max(sceneData.byteLength, 1024 * 1024);
            this.sceneBuffer = this.device.createBuffer({
                size: newCap,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.sceneBufferDevice = this.device;
            this.sceneBufferCapacity = newCap;
            this.rebuildRayTracingBindGroup();
        }
        
        // 데이터 업데이트
        this.device.queue.writeBuffer(this.sceneBuffer, 0, sceneData);

        // Scene hash 계산 및 변경 감지
        const newHash = this.computeSceneHash(sceneData);
        if (newHash !== this.lastSceneHash) {
            this.lastSceneHash = newHash;
            this.sceneChangedThisFrame = true;
        }

        // BVH 업데이트 (frustum culling된 scene으로)
        if (this.enableBVH) {
            this.buildBVH(scene);
            
            // BVH 갱신에 따라 BindGroup 재생성
            this.rebuildRayTracingBindGroup();
        }
    }

    render = (look_from: vec3, look_at: vec3, v_up: vec3, v_fov: number, aspect_ratio: number) => {
        // --- 카메라 이동 감지 (간단: 이전 origin/target 비교) ---
        const camMovedInfo = (() => {
            if (!this._lastCamFrom || !this._lastCamAt) return { any:true, pos:true, rot:true };
            const df = Math.hypot(look_from[0]-this._lastCamFrom[0], look_from[1]-this._lastCamFrom[1], look_from[2]-this._lastCamFrom[2]);
            const da = Math.hypot(look_at[0]-this._lastCamAt[0], look_at[1]-this._lastCamAt[1], look_at[2]-this._lastCamAt[2]);
            const posMoved = df > 1e-4;
            const rotOnly = !posMoved && da > 1e-4;
            return { any: (df+da) > 1e-4, pos: posMoved, rot: rotOnly };
        })();
        const camMoved = camMovedInfo.any;
        this._lastCamFrom = [...look_from];
        this._lastCamAt = [...look_at];

        // --- Frustum Culling & Scene Buffer Update (카메라가 움직이지 않으면 스킵) ---
        if (camMoved) {
            const culledScene = this.performFrustumCulling(look_from, look_at, v_up, v_fov, aspect_ratio);
            this.updateSceneBuffer(culledScene);
            this.cameraChangedThisFrame = true;
            this.lastAccumPrevIndex = -1; // force bindgroup rebuild
        } else {
            this.cameraChangedThisFrame = false;
        }

        // Scene 변경 또는 카메라 이동 시 누적 초기화
        if (camMoved || this.sceneChangedThisFrame) {
            this.frameCounter = 0;
        }

        // --- Camera Calculation ---
        const theta = v_fov * (Math.PI / 180.0);
        const h = Math.tan(theta / 2.0);
        const viewport_height = 2.0 * h;
        const viewport_width = aspect_ratio * viewport_height;

    const w = normalize(subtract(look_from, look_at));
    const camU = normalize(cross(v_up, w));
    const camV = cross(w, camU);

        const origin = look_from;
    const horizontal = scale(camU, viewport_width);
    const vertical = scale(camV, viewport_height);
        const lower_left_corner = subtract(subtract(subtract(origin, scale(horizontal, 0.5)), scale(vertical, 0.5)), w);

        const cameraData = new Float32Array([
            ...origin, 0.0, // padding
            ...lower_left_corner, 0.0, // padding
            ...horizontal, 0.0, // padding
            ...vertical, 0.0, // padding
        ]);
        this.device.queue.writeBuffer(this.camera_buffer, 0, cameraData);

        // --- Update Uniforms ---
        // --- Adaptive Samples Per Pixel ---
        // 카메라가 움직이면 노이즈 억제를 위한 누적 대신 빠른 응답 위해 낮춤, 멈추면 점증
        if (camMoved || this.sceneChangedThisFrame) {
            if (camMovedInfo.pos || this.sceneChangedThisFrame) {
                // Position change: stronger decay
                this._accumulatedStillFrames = Math.floor(this._accumulatedStillFrames * 0.15);
                const targetDrop = Math.max(this.minAdaptiveSPP, Math.floor(this.lastSPPUsed * 0.4));
                if (targetDrop < this.lastSPPUsed) this.lastSPPUsed = targetDrop;
            } else if (camMovedInfo.rot) {
                // Pure rotation: mild decay
                this._accumulatedStillFrames = Math.floor(this._accumulatedStillFrames * 0.6);
                const targetDrop = Math.max(this.minAdaptiveSPP, Math.floor(this.lastSPPUsed * 0.7));
                if (targetDrop < this.lastSPPUsed) this.lastSPPUsed = targetDrop;
            }
        } else {
            this._accumulatedStillFrames = Math.min(this._accumulatedStillFrames + 1, 1000);
        }
    const samples_per_pixel = this.computeAdaptiveSPP();
    if (samples_per_pixel !== this.lastSPPUsed) {
        console.log(`[AdaptiveSPP] stillFrames=${this._accumulatedStillFrames} -> spp=${samples_per_pixel}`);
        this.lastSPPUsed = samples_per_pixel;
    }
    // frameCounter는 '지금까지 누적된 프레임 수(이전 프레임들)'이므로 여기서 증가시키지 않음. (Submit 후 증가)
        const seed = Math.random() * 4294967295; // Random u32
    const resetFlag = (this.cameraChangedThisFrame || this.sceneChangedThisFrame) ? 1 : 0;
    const frameCountForGPU = this.frameCounter >>> 0; // clamp to u32
    const disabledTypeMask = 0; // TODO: expose UI to toggle types
    const useBVHFlag = this.useBVHThisFrame ? 1 : 0;
    const uniformData = new Uint32Array([samples_per_pixel, seed, frameCountForGPU, resetFlag, disabledTypeMask, useBVHFlag]);
    this.device.queue.writeBuffer(this.uniform_buffer, 0, uniformData);

        const commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();
        // 카메라 움직여도 reset_flag 로 첫 프레임에서 이전 누적 무시하므로 별도 clear 불필요

        // --- Accumulation ping-pong 인덱스 결정 ---
        const prevIndex = this.frameCounter % 2; // 이전 누적이 들어있는 텍스처
        const nextIndex = (prevIndex + 1) % 2;    // 이번 프레임 결과를 쓸 텍스처
        const prevView = this.accum_views[prevIndex] ?? this.color_buffer_view;
        const nextView = this.accum_views[nextIndex] ?? this.color_buffer_view;
        if (prevIndex !== this.lastAccumPrevIndex) {
            this.rebuildRayTracingBindGroup(prevView, nextView);
            this.lastAccumPrevIndex = prevIndex;
        }

        const ray_trace_pass : GPUComputePassEncoder = commandEncoder.beginComputePass();
        ray_trace_pass.setPipeline(this.ray_tracing_pipeline);
    // BindGroup은 prevIndex 변경 시에만 재생성 (위에서 처리)
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

    // 프레임 처리 후 누적 프레임 수 증가 (리셋된 프레임은 0에서 시작)
    this.frameCounter++;
    // Scene 변경 플래그 소모
    this.sceneChangedThisFrame = false;

    }

    // BVH 구축 메서드
    buildBVH(scene: Scene): void {
    const result = this.bvhBuilder.buildBVH(scene);
    this.lastBVHStats = result.stats;
    // Auto fallback: if stats.autoFallback, disable BVH traversal (brute force path)
    this.useBVHThisFrame = !result.stats.autoFallback && this.enableBVH;
    this.bvhNodes = result.nodes;
    this.bvhPrimitiveIndices = result.primitiveIndices;

        // BVH 노드 데이터를 GPU 버퍼로 패킹
        if (this.bvhNodes.length > 0) {
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
            const needed = Math.max(nodeData.byteLength, 16);
            if (!this.bvhBuffer || this.bvhBufferCapacity < needed || (this.bvhBufferCapacity & 3) !== 0) {
                if (this.bvhBuffer) { try { this.bvhBuffer.destroy(); } catch {} }
                let newCap = Math.ceil(needed * 1.5);
                // 256-byte alignment to satisfy WebGPU storage buffer alignment & multiple-of-4
                newCap = (newCap + 255) & ~255;
                this.bvhBuffer = this.device.createBuffer({
                    size: newCap,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                this.bvhBufferCapacity = newCap;
            }
            this.device.queue.writeBuffer(this.bvhBuffer, 0, nodeData);
        }

        // Primitive 인덱스 버퍼 생성
        if (this.bvhPrimitiveIndices.length > 0) {
            const indexData = new Uint32Array(this.bvhPrimitiveIndices);
            const needed = Math.max(indexData.byteLength, 16);
            if (!this.primitiveIndexBuffer || this.primitiveIndexBufferCapacity < needed || (this.primitiveIndexBufferCapacity & 3) !== 0) {
                if (this.primitiveIndexBuffer) { try { this.primitiveIndexBuffer.destroy(); } catch {} }
                let newCap = Math.ceil(needed * 1.5);
                newCap = (newCap + 255) & ~255;
                this.primitiveIndexBuffer = this.device.createBuffer({
                    size: newCap,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                this.primitiveIndexBufferCapacity = newCap;
            }
            this.device.queue.writeBuffer(this.primitiveIndexBuffer, 0, indexData);
        }

        // Primitive 정보 버퍼 생성 (타입 + 지오메트리 인덱스)
        if (result.primitiveInfos.length > 0) {
            const primitiveInfoData = new Uint32Array(result.primitiveInfos.length * 4);
            for (let i = 0; i < result.primitiveInfos.length; i++) {
                const info = result.primitiveInfos[i];
                const offset = i * 4;
                primitiveInfoData[offset + 0] = info.type;
                primitiveInfoData[offset + 1] = info.index;
                primitiveInfoData[offset + 2] = 0;
                primitiveInfoData[offset + 3] = 0;
            }
            const needed = Math.max(primitiveInfoData.byteLength, 16);
            if (!this.primitiveInfoBuffer || this.primitiveInfoBufferCapacity < needed || (this.primitiveInfoBufferCapacity & 3) !== 0) {
                if (this.primitiveInfoBuffer) { try { this.primitiveInfoBuffer.destroy(); } catch {} }
                let newCap = Math.ceil(needed * 1.5);
                newCap = (newCap + 255) & ~255;
                this.primitiveInfoBuffer = this.device.createBuffer({
                    size: newCap,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                this.primitiveInfoBufferCapacity = newCap;
            }
            this.device.queue.writeBuffer(this.primitiveInfoBuffer, 0, primitiveInfoData);
        }

    // console.log(`BVH built: ${this.bvhNodes.length} nodes, ${this.bvhPrimitiveIndices.length} primitives`); // can re-enable for stats
    }

    private getDummyBuffer(): GPUBuffer {
        if (!this.dummyBuffer) {
            this.dummyBuffer = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
        }
        return this.dummyBuffer;
    }

    // BVH 플래그 토글 (디바이스/파이프라인 재생성 없이)
    toggleBVH() {
        this.enableBVH = !this.enableBVH;
        if (this.enableBVH && this.currentScene) {
            this.buildBVH(this.currentScene);
        } else {
            this.useBVHThisFrame = false;
        }
        this.rebuildRayTracingBindGroup();
        console.log(`BVH: ${this.enableBVH ? 'Enabled' : 'Disabled'}`);
        if (this.lastBVHStats) {
            console.log(`[BVH Stats] prims=${this.lastBVHStats.primitiveCount} autoFallback=${this.lastBVHStats.autoFallback} gain=${(this.lastBVHStats.improvementRatio*100).toFixed(1)}%`);
        }
    }

    // FNV-1a 32bit 해시 (Float32Array 기반). 장면 변경 감지용.
    private computeSceneHash(arr: Float32Array): number {
        let h = 0x811c9dc5 >>> 0; // offset basis
        const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
        // 바이트 단위 처리 (정밀도 변화에도 안정적)
        for (let i = 0; i < view.byteLength; i++) {
            h ^= view.getUint8(i);
            h = Math.imul(h, 0x01000193) >>> 0; // FNV prime
        }
        return h >>> 0;
    }
    
}