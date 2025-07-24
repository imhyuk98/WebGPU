import structs_shader from "./shaders/structs.wgsl"
import scene_shader_code from "./shaders/scene.wgsl"
import intersections_shader from "./shaders/intersections.wgsl"
import raytracer_kernel from "./shaders/raytracer_kernel.wgsl"
import screen_shader from "./shaders/screen_shader.wgsl"
import { Material, MaterialType, MaterialTemplates } from "./material";

// Helper types and functions for vector math
type vec3 = [number, number, number];

const vec3 = (x: number, y: number, z: number): vec3 => [x, y, z];
const add = (a: vec3, b: vec3): vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subtract = (a: vec3, b: vec3): vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: vec3, s: number): vec3 => [a[0] * s, a[1] * s, a[2] * s];
const length = (a: vec3): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const normalize = (a: vec3): vec3 => {
    const l = length(a);
    return l > 0 ? scale(a, 1 / l) : vec3(0, 0, 0);
};

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
    color: vec3;
    material: Material;
}

// Scene containing all objects
export interface Scene {
    spheres: Sphere[];
    cylinders: Cylinder[];
    boxes: Box[];
    planes: Plane[];
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

    // canvas 연결
    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;
    }

   // Initialize now takes a Scene object
   async Initialize(scene: Scene) {

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
        const headerSize = 4; // 4 floats for the header
        const sphereStride = 8; // 8 floats per sphere (vec3, float, vec3, float)
        const cylinderStride = 12; // 12 floats per cylinder based on WGSL struct alignment
        const boxStride = 16; // 16 floats per box (vec3, vec3, vec3, vec3)
        const planeStride = 20;  // Plane 크기

        const totalSizeInFloats = headerSize + scene.spheres.length * sphereStride + scene.cylinders.length * cylinderStride + scene.boxes.length * boxStride + scene.planes.length * planeStride;  // 이 줄 추가!;
        const sceneData = new Float32Array(totalSizeInFloats);

        // 1. Write header
        sceneData[0] = scene.spheres.length;
        sceneData[1] = scene.cylinders.length;
        sceneData[2] = scene.boxes.length; // 직육면체 개수 추가
        sceneData[3] = scene.planes.length;  // Plane 개수 추가

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

        // Create a storage buffer for the scene data
        const sceneBuffer = this.device.createBuffer({
            size: sceneData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, // STORAGE : Compute shader에서 읽기/쓰기 가능, COPY_DST : CPU에서 GPU로 데이터 복사 가능
        });
        this.device.queue.writeBuffer(sceneBuffer, 0, sceneData); // CPU 메모리의 sceneData 배열을 GPU 메모리의 sceneBuffer로 복사. 이 시점에서 구와 실린더 정보가 GPU에 저장됨

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
            ${scene_shader_code}
            ${intersections_shader}
            ${raytracer_kernel}
        `;

        const ray_tracing_bind_group_layout = this.device.createBindGroupLayout({
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
                }
            ]
        });
    
        this.ray_tracing_bind_group = this.device.createBindGroup({
            layout: ray_tracing_bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: this.color_buffer_view
                },
                {
                    binding: 1,
                    resource: { buffer: sceneBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.uniform_buffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.camera_buffer }
                }
            ]
        });
        
        const ray_tracing_pipeline_layout = this.device.createPipelineLayout({
            bindGroupLayouts: [ray_tracing_bind_group_layout]
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

    render = (look_from: vec3, look_at: vec3, v_up: vec3, v_fov: number, aspect_ratio: number) => {

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
        const samples_per_pixel = 16; // 100 → 16으로 성능 개선
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
    
}

// Helper function for cross product, needed for camera calculations
function cross(a: vec3, b: vec3): vec3 {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}