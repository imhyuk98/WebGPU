import { Camera } from "./camera";

export class Controls {
    canvas: HTMLCanvasElement;
    camera: Camera;
    
    // 입력 상태
    keysPressed: Set<string> = new Set();
    mousePosition: { x: number, y: number } = { x: 0, y: 0 };
    mouseLocked: boolean = false;
    
    // 카메라 회전 각도 (도 단위)
    yaw: number = 0;   // 좌우 회전
    pitch: number = 0; // 상하 회전
    
    // 설정
    moveSpeed: number = 5.0;     // 이동 속도
    mouseSensitivity: number = 0.15; // 마우스 감도

    constructor(canvas: HTMLCanvasElement, camera: Camera) {
        this.canvas = canvas;
        this.camera = camera;
        
        this.setupEventListeners();
        this.setupPointerLock();
    }

    private setupEventListeners() {
        // 키보드 이벤트
        document.addEventListener('keydown', (event) => {
            this.keysPressed.add(event.code);
        });

        document.addEventListener('keyup', (event) => {
            this.keysPressed.delete(event.code);
        });

        // 마우스 이동 이벤트
        document.addEventListener('mousemove', (event) => {
            if (this.mouseLocked) {
                this.handleMouseMove(event.movementX, event.movementY);
            }
        });
    }

    private setupPointerLock() {
        // 캔버스 클릭시 마우스 잠금
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });

        // Pointer Lock 상태 변화 감지
        document.addEventListener('pointerlockchange', () => {
            this.mouseLocked = document.pointerLockElement === this.canvas;
            
            if (this.mouseLocked) {
                console.log("마우스 잠금 활성화 - WASD로 이동, 마우스로 시점 회전");
            } else {
                console.log("마우스 잠금 해제 - 캔버스를 클릭해서 다시 활성화");
            }
        });

        // ESC 키로 마우스 잠금 해제
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Escape' && this.mouseLocked) {
                document.exitPointerLock();
            }
        });
    }

    private handleMouseMove(deltaX: number, deltaY: number) {
        // 마우스 이동을 각도로 변환
        this.yaw += deltaX * this.mouseSensitivity;
        this.pitch += deltaY * this.mouseSensitivity; // ✅ Y축 반전 제거 (- 제거)

        // Pitch 제한 (위아래로 너무 많이 회전하지 않도록)
        this.pitch = Math.max(-89, Math.min(89, this.pitch));
        
        this.updateCameraRotation();
    }

    private updateCameraRotation() {
        // 각도를 라디안으로 변환
        const yawRad = this.yaw * Math.PI / 180;
        const pitchRad = this.pitch * Math.PI / 180;

        // 카메라가 바라보는 방향 계산, 구면 좌표계 -> 직교 좌표계 변환
        const lookDirection = [
            Math.cos(pitchRad) * Math.cos(yawRad),
            Math.sin(pitchRad),
            Math.cos(pitchRad) * Math.sin(yawRad)
        ];

        // look_at = position + direction
        const newLookAt: [number, number, number] = [
            this.camera.position[0] + lookDirection[0],
            this.camera.position[1] + lookDirection[1],
            this.camera.position[2] + lookDirection[2]
        ];

        this.camera.setLookAt(newLookAt[0], newLookAt[1], newLookAt[2]);
    }

    update(deltaTime: number) {
        const distance = this.moveSpeed * deltaTime;

        // 현재 카메라 방향 벡터들 계산
        const forward = this.getForwardVector();
        const right = this.getRightVector();

        // WASD 키 처리
        if (this.keysPressed.has('KeyW')) {
            this.moveCamera(forward, distance);
        }
        if (this.keysPressed.has('KeyS')) {
            this.moveCamera(forward, -distance);
        }
        if (this.keysPressed.has('KeyD')) {
            this.moveCamera(right, distance);
        }
        if (this.keysPressed.has('KeyA')) {
            this.moveCamera(right, -distance);
        }

        // ✅ 위아래 이동 - 카메라의 up 벡터 방향 사용
        if (this.keysPressed.has('Space')) {
            const up = this.normalize(this.camera.up);
            this.camera.position[0] += up[0] * distance;
            this.camera.position[1] += up[1] * distance;
            this.camera.position[2] += up[2] * distance;
            this.updateCameraRotation();
        }
        if (this.keysPressed.has('ShiftLeft')) {
            const up = this.normalize(this.camera.up);
            this.camera.position[0] -= up[0] * distance;
            this.camera.position[1] -= up[1] * distance;
            this.camera.position[2] -= up[2] * distance;
            this.updateCameraRotation();
        }
    }

    private getForwardVector(): [number, number, number] {
        const lookAt = this.camera.look_at;
        const position = this.camera.position;
        
        const forward: [number, number, number] = [
            lookAt[0] - position[0],
            lookAt[1] - position[1],
            lookAt[2] - position[2]
        ];
        
        return this.normalize(forward);
    }

    private getRightVector(): [number, number, number] {
        const forward = this.getForwardVector();
        const up = this.camera.up; // ✅ 카메라의 실제 up 벡터 사용
        
        // Right = Forward × Up (외적)
        const right: [number, number, number] = [
            forward[1] * up[2] - forward[2] * up[1],
            forward[2] * up[0] - forward[0] * up[2],
            forward[0] * up[1] - forward[1] * up[0]
        ];
        
        return this.normalize(right);
    }

    private normalize(vector: [number, number, number]): [number, number, number] {
        const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
        if (length === 0) return [0, 0, 0];
        
        return [vector[0] / length, vector[1] / length, vector[2] / length];
    }

    private moveCamera(direction: [number, number, number], distance: number) {
        this.camera.position[0] += direction[0] * distance;
        this.camera.position[1] += direction[1] * distance;
        this.camera.position[2] += direction[2] * distance;
        
        this.updateCameraRotation(); // look_at도 함께 업데이트
    }

    // 설정 메서드들
    setMoveSpeed(speed: number) {
        this.moveSpeed = speed;
    }

    setMouseSensitivity(sensitivity: number) {
        this.mouseSensitivity = sensitivity;
    }

    // 디버그 정보
    getDebugInfo() {
        return {
            position: this.camera.position,
            yaw: this.yaw.toFixed(1),
            pitch: this.pitch.toFixed(1),
            mouseLocked: this.mouseLocked,
            keysPressed: Array.from(this.keysPressed)
        };
    }
}