import { Renderer } from "./renderer";
import { createScene, SceneType } from "./Scene";
import { Camera } from "./camera";
import { Controls } from "./control";
import { FPSCounter } from "./fps";
import { Material, MaterialType, MaterialTemplates } from "./material";

class App {
    canvas: HTMLCanvasElement;
    renderer: Renderer;
    camera: Camera;
    controls: Controls;
    fpsCounter: FPSCounter;

    lastTime: number = 0;
    isRunning: boolean = false;

    constructor() {
        this.canvas = <HTMLCanvasElement> document.getElementById("gfx-main");
        this.renderer = new Renderer(this.canvas);
        
        // 카메라 초기 설정
        this.camera = Camera.presets.showcase(); // 좋은 시작 위치
        
        // 조작 설정
        this.controls = new Controls(this.canvas, this.camera);

        this.fpsCounter = new FPSCounter();
    }

    async initialize() {
        // 씬 생성 및 렌더러 초기화
        const scene = createScene(SceneType.SHOWCASE);
        await this.renderer.Initialize(scene);
        
        // 애니메이션 루프 시작
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop();
        
        console.log("🎮 조작법:");
        console.log("- 캔버스 클릭: 마우스 잠금");
        console.log("- WASD: 이동");
        console.log("- Space/Shift: 위아래 이동");
        console.log("- 마우스: 시점 회전");
        console.log("- ESC: 마우스 잠금 해제");
    }

    gameLoop() {
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