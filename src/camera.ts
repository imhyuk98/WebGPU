export class Camera {
    position: [number, number, number];
    look_at: [number, number, number];
    up: [number, number, number];
    fov: number;

    constructor(
        position: [number, number, number] = [0, 0, 0],
        look_at: [number, number, number] = [0, 0, -1],
        up: [number, number, number] = [0, 1, 0],
        fov: number = 45
    ) {
        this.position = position;
        this.look_at = look_at;
        this.up = up;
        this.fov = fov;
    }

    // 카메라 위치 설정
    setPosition(x: number, y: number, z: number) {
        this.position = [x, y, z];
    }

    // 카메라가 바라보는 방향 설정
    setLookAt(x: number, y: number, z: number) {
        this.look_at = [x, y, z];
    }

    // 카메라 위쪽 방향 설정
    setUp(x: number, y: number, z: number) {
        this.up = [x, y, z];
    }

    // 시야각 설정
    setFOV(fov: number) {
        this.fov = fov;
    }

    // 카메라 파라미터 반환
    getCameraParams() {
        return {
            look_from: this.position,
            look_at: this.look_at,
            v_up: this.up,
            v_fov: this.fov
        };
    }

    // 미리 정의된 카메라 위치들
    static presets = {
        // 원점에서 정면으로 보기
        origin: () => new Camera([0, 0, 0], [0, 0, -1], [0, 1, 0], 45),
        
        // 쇼케이스 뷰 (모든 도형이 잘 보이는 위치)
        showcase: () => new Camera([0, 3, 5], [0, 0, -5], [0, 1, 0], 45),
        
        // 위에서 내려다보기
        topDown: () => new Camera([0, 10, 0], [0, 0, 0], [0, 0, -1], 60),
        
        // 측면에서 보기
        side: () => new Camera([10, 2, 0], [0, 0, 0], [0, 1, 0], 45),
        
        // 비스듬히 보기
        diagonal: () => new Camera([8, 4, 8], [0, 0, -5], [0, 1, 0], 45)
    };
}