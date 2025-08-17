import { Renderer } from "./renderer";
import { createScene, SceneType, createSceneFromWorld } from "./Scene";
import { Camera } from "./camera";
import { Controls } from "./control";
import { FPSCounter } from "./fps";
import { Material, MaterialType, MaterialTemplates } from "./material";
import { WorldPrimitives, attachDTDSLoader } from "./importer";


class App {
    canvas: HTMLCanvasElement;
    renderer: Renderer;
    camera: Camera;
    controls: Controls;
    fpsCounter: FPSCounter;
    loadedWorld: WorldPrimitives | null = null;

    lastTime: number = 0;
    isRunning: boolean = false;
    currentSceneType: SceneType = SceneType.SHOWCASE;

    constructor() {
        this.canvas = <HTMLCanvasElement> document.getElementById("gfx-main");
        this.renderer = new Renderer(this.canvas);
        
        // 카메라 초기 설정
        this.camera = Camera.presets.showcase(); // 좋은 시작 위치
        
        // 조작 설정
        this.controls = new Controls(this.canvas, this.camera);

        this.fpsCounter = new FPSCounter();
        
        // 키보드 이벤트 리스너 추가
        this.setupKeyboardControls();

        // 파일 로더 설정
        this.setupFileLoader();
    }

    async initialize() {
        // 씬 생성 및 렌더러 초기화
        const scene = createScene(this.currentSceneType);
        await this.renderer.Initialize(scene);
        
        // 애니메이션 루프 시작
        this.isRunning = true;
        this.lastTime = performance.now(); // 라우저 API. 현재 시간을 밀리초로 반환
        this.gameLoop();
    }

    // 파일 로더 설정
    setupFileLoader() {
        const picker = document.getElementById("dtdsPicker") as HTMLInputElement | null;
        if (picker) {
            // attachDTDSLoader를 사용하여 파일 로드 시 콜백 함수를 실행합니다.
            attachDTDSLoader(picker, (world, file) => {
                console.log(`[App] Loaded primitives from ${file.name}`);
                this.loadedWorld = world;
                this.loadPrimitivesAsScene(world);
            }, { 
                log: true, // 디버깅을 위해 콘솔에 로그를 계속 출력합니다.
                collapsed: true 
            });
        } else {
            console.warn("File picker #dtdsPicker not found.");
        }
    }

    // 키보드 컨트롤 설정
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
            switch(event.key) {
                case '1':
                    this.switchScene(SceneType.SHOWCASE);
                    break;
                case '2':
                    this.switchScene(SceneType.TORUS_FIELD);
                    break;
                case '3':
                    this.switchScene(SceneType.METAL_TEST);
                    break;
                case 'f':
                case 'F':
                    // Frustum Culling 토글
                    this.renderer.enableFrustumCulling = !this.renderer.enableFrustumCulling;
                    console.log(`Frustum Culling: ${this.renderer.enableFrustumCulling ? 'Enabled' : 'Disabled'}`);
                    break;
                case 'b':
                case 'B':
                    // BVH 토글
                    this.renderer.enableBVH = !this.renderer.enableBVH;
                    console.log(`BVH: ${this.renderer.enableBVH ? 'Enabled' : 'Disabled'}`);
                    // 씬을 다시 초기화해야 BVH 변경사항이 적용됨
                    this.switchScene(this.currentSceneType);
                    break;
                default:
                    return; // 다른 키는 무시
            }
            event.preventDefault();
        });
    }

    // Scene 전환
    async switchScene(newSceneType: SceneType) {
        this.currentSceneType = newSceneType;
        
        // 렌더링 일시정지
        this.isRunning = false;
        
        // 새로운 씬 생성 및 렌더러 재초기화
        const scene = createScene(newSceneType);
        await this.renderer.Initialize(scene);
        
        // 렌더링 재시작
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop();
    }

	// 로드된 프리미티브로 새로운 Scene을 생성하고 렌더링합니다.
	async loadPrimitivesAsScene(world: WorldPrimitives) {
		console.log("[App] Creating a new scene from loaded primitives...");
		
		// 렌더링 루프를 일시 중지합니다.
		this.isRunning = false;

		// world 데이터를 기반으로 새로운 Scene 객체를 생성합니다.
		const newScene = createSceneFromWorld(world);

		// 새로운 씬으로 렌더러를 재초기화합니다.
		await this.renderer.Initialize(newScene);
		
		// 렌더링을 다시 시작합니다.
		this.isRunning = true;
		this.lastTime = performance.now();
		this.gameLoop();
	}    gameLoop() {
        if (!this.isRunning) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000; // 초 단위
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        this.fpsCounter.update(currentTime);

        requestAnimationFrame(() => this.gameLoop());
    }

    update(deltaTime: number) {
        // 조작 업데이트
        this.controls.update(deltaTime);
    }

    render() {
        // 카메라 파라미터 가져오기
        const { look_from, look_at, v_up, v_fov } = this.camera.getCameraParams();
        const aspect_ratio = this.canvas.width / this.canvas.height;

        // 렌더링 (GPU 타이머는 renderer 내부에서 처리)
        this.renderer.render(look_from, look_at, v_up, v_fov, aspect_ratio);
    }

    // 디버그 정보 출력 (F12 콘솔에서 app.debug() 호출)
    debug() {
        console.log(this.controls.getDebugInfo());
    }
}

// 전역 변수로 앱 인스턴스 저장 (디버깅용)
let app: App;

async function main() {
    app = new App();
    await app.initialize();
    
    // 전역에서 접근 가능하도록 설정
    (window as any).app = app;
}

main();