import { Scene, Sphere, Cylinder, Box, Plane, Circle, Ellipse, Line, Torus } from "./renderer";
import { Material, MaterialType, MaterialTemplates } from "./material";

// --- Helper Functions ---
function random_double(min: number, max: number): number {
    return min + (max - min) * Math.random();
}

function random_vec3(min: number, max: number): [number, number, number] {
    return [random_double(min, max), random_double(min, max), random_double(min, max)];
}

function normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    if (len > 0) {
        return [v[0]/len, v[1]/len, v[2]/len];
    }
    return [0, 0, 0];
}

// --- Scene Creation Functions ---

export function createBasicScene(): Scene {
    const scene: Scene = {
        spheres: [],
        cylinders: [],
        boxes: [],
        planes: [],
        circles: [],
        ellipses: [],
        lines: [],
        toruses: []
    };

    // 바닥 평면
    scene.planes.push({
        center: [0, 0, 0],
        normal: [0, 1, 0],
        size: [20, 20],
        rotation: [0, 0, 0],
        color: [0.2, 0.8, 0.2], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 정면 벽
    scene.planes.push({
        center: [0, 3, -3],
        normal: [0, 0, 1],
        size: [15, 8],
        rotation: [0, 0, 0],
        color: [1.0, 0.2, 0.2], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 측면 벽
    scene.planes.push({
        center: [-8, 3, 0],
        normal: [1, 0, 0],
        size: [12, 8],
        rotation: [0, 0, 0],
        color: [0.2, 0.2, 1.0], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    return scene;
}

export function createRandomScene(): Scene {
    const scene: Scene = {
        spheres: [],
        cylinders: [],
        boxes: [],
        planes: [],
        circles: [],
        ellipses: [],
        lines: [],
        toruses: []
    };

    // 바닥 구
    scene.spheres.push({
        center: [0, -1000, 0],
        radius: 1000,
        color: [0.5, 0.5, 0.5], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 랜덤 작은 객체들
    for (let a = -11; a < 11; a++) {
        for (let b = -11; b < 11; b++) {
            const center_x = a + 0.9 * Math.random();
            const center_z = b + 0.9 * Math.random();

            const p_ref: [number, number, number] = [4, 0.2, 0];
            const dist_sq = (center_x - p_ref[0])**2 + (0.2 - p_ref[1])**2 + (center_z - p_ref[2])**2;

            if (dist_sq > 0.9*0.9) {
                const color: [number, number, number] = [ // ✅ color → color
                    Math.random() * Math.random(), 
                    Math.random() * Math.random(), 
                    Math.random() * Math.random()
                ];
                
                // ✅ 2가지 재질만 사용
                const materials = [MaterialTemplates.MATTE, MaterialTemplates.MIRROR];
                const material = materials[Math.floor(Math.random() * materials.length)];
                
                const choose_obj = Math.random();

                if (choose_obj < 0.4) { // 40% spheres
                    const center: [number, number, number] = [center_x, 0.2, center_z];
                    scene.spheres.push({ center, radius: 0.2, color, material });
                } else if (choose_obj < 0.7) { // 30% cylinders
                    const radius = 0.2;
                    const height = random_double(0.2, 0.5);
                    const axis = normalize(random_vec3(-1, 1));
                    const center: [number, number, number] = [center_x, height / 2, center_z];
                    scene.cylinders.push({ center, axis, height, radius, color, material });
                } else { // 30% boxes
                    const width = random_double(0.1, 0.5);
                    const height = random_double(0.1, 0.6);
                    const depth = random_double(0.1, 0.4);
                    const center: [number, number, number] = [center_x, height / 2, center_z];
                    const rotation: [number, number, number] = [
                        random_double(0, Math.PI/4),
                        random_double(0, Math.PI),
                        random_double(0, Math.PI/6)
                    ];
                    scene.boxes.push({ 
                        center, 
                        size: [width, height, depth],
                        rotation, 
                        color, // ✅ color → color
                        material
                    });
                }
            }
        }
    }

    // 세 개의 큰 구
    scene.spheres.push({
        center: [0, 1, 0],
        radius: 1.0,
        color: [0.95, 0.95, 0.95], // ✅ color → color
        material: MaterialTemplates.MIRROR
    });

    scene.spheres.push({
        center: [-4, 1, 0],
        radius: 1.0,
        color: [0.4, 0.2, 0.1], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    scene.spheres.push({
        center: [4, 1, 0],
        radius: 1.0,
        color: [0.7, 0.6, 0.5], // ✅ color → color
        material: MaterialTemplates.MIRROR // ✅ ROUGH_METAL → MIRROR
    });

    return scene;
}

export function createMixedScene(): Scene {
    const scene: Scene = {
        spheres: [],
        cylinders: [],
        boxes: [],
        planes: [],
        circles: [],
        ellipses: [],
        lines: [],
        toruses: []
    };

    // 바닥 평면
    scene.planes.push({
        center: [0, -0.5, 0],
        normal: [0, 1, 0],
        size: [20, 20],
        rotation: [0, 0, 0],
        color: [0.8, 0.8, 0.8], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 몇 개의 구
    scene.spheres.push({
        center: [0, 1, 0],
        radius: 1.0,
        color: [1.0, 0.3, 0.3], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    scene.spheres.push({
        center: [-3, 0.5, 2],
        radius: 0.5,
        color: [0.3, 1.0, 0.3], // ✅ color → color
        material: MaterialTemplates.MIRROR
    });

    // 실린더
    scene.cylinders.push({
        center: [2, 1, -1],
        axis: [0, 1, 0],
        height: 2.0,
        radius: 0.5,
        color: [0.3, 0.3, 1.0], // ✅ color → color
        material: MaterialTemplates.MIRROR // ✅ ROUGH_METAL → MIRROR
    });

    // 박스
    scene.boxes.push({
        center: [-2, 0.5, -2],
        size: [1, 1, 1],
        rotation: [0, Math.PI/4, 0],
        color: [1.0, 1.0, 0.3], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    return scene;
}

export function createShowcaseScene(): Scene {
    const scene: Scene = {
        spheres: [],
        cylinders: [],
        boxes: [],
        planes: [],
        circles: [],
        ellipses: [],
        lines: [],
        toruses: []
    };

    // 🏠 바닥 평면 (회색) - 카메라 앞쪽 아래에 배치
    scene.planes.push({
        center: [0, 10, -8],
        normal: [0, 0, 1],
        size: [20, 20],
        rotation: [Math.PI/2, 0, 0],
        color: [1.0, 1.0, 0.2], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 🔴 Sphere (구) - 왼쪽
    scene.spheres.push({
        center: [-4, 0, -8],
        radius: 1.0,
        color: [1.0, 0.2, 0.2], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 🟢 Cylinder (실린더) - 중앙 왼쪽
    scene.cylinders.push({
        center: [-1, 0, -8],
        axis: [0, 1, 0],
        height: 2.0,
        radius: 0.6,
        color: [0.2, 1.0, 0.2], // ✅ color → color
        material: MaterialTemplates.MIRROR
    });

    // 🔵 Box (박스) - 중앙 오른쪽
    scene.boxes.push({
        center: [2, 0, -8],
        size: [1.2, 1.2, 1.2],
        rotation: [0, Math.PI/4, Math.PI/6],
        color: [0.2, 0.2, 1.0], // ✅ color → color
        material: MaterialTemplates.MIRROR // ✅ ROUGH_METAL → MIRROR
    });

    // 🟡 Plane (평면) - 오른쪽, 카메라를 향하도록
    scene.planes.push({
        center: [5, 0, -8],
        normal: [0, 0, 1],
        size: [2.5, 2.5],
        rotation: [0, 0, 0],
        color: [1.0, 1.0, 0.2], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 🟠 Circle (원) - 맨 오른쪽, sphere와 같은 높이 및 반지름
    scene.circles.push({
        center: [8, 0, -8], // 다른 도형들과 같은 높이 (y=0), 맨 오른쪽 (x=8)
        radius: 1.0, // sphere와 같은 반지름
        normal: [0, 0, 1], // Z축을 향하도록 (카메라 쪽)
        color: [1.0, 0.5, 0.2], // 주황색
        material: MaterialTemplates.MIRROR
    });

    // 🟡 Ellipse (타원) - Circle 옆에 추가
    scene.ellipses.push({
        center: [12, 0, -8], // Circle에서 더 멀리 떨어뜨림 (x=10 → x=12)
        radiusA: 1.5, // 장축 반지름 (가로)
        radiusB: 0.8, // 단축 반지름 (세로)
        normal: [0, 0, 1], // Z축을 향하도록 (카메라 쪽)
        rotation: [0, 0, 0.5], // Z축 중심으로 약간 회전 (약 28.6도)
        color: [1.0, 1.0, 0.2], // 밝은 노란색
        material: MaterialTemplates.MATTE // 거울 재질 → 무광 재질로 변경
    });

    // 🟤 Line (선) - Ellipse 옆에 추가
    scene.lines.push({
        start: [14, -1, -8], // Ellipse 옆에서 시작
        end: [14, 1, -8],    // 위쪽으로 2 단위 길이
        thickness: 0.005,     // 훨씬 얇은 두께 (0.1 → 0.02)
        color: [0.6, 0.3, 0.1], // 갈색
        material: MaterialTemplates.MATTE
    });

    // 🍩 Torus (토러스) - Line 옆에 추가
    scene.toruses.push({
        center: [16, 0, -8], // Line 옆 (x=16)
        rotation: [Math.PI/2, 0, 0], // X축 중심으로 90도 회전 (세워서 보이게)
        majorRadius: 1.2,    // 주반지름 (도넛 중심에서 튜브 중심까지)
        minorRadius: 0.4,    // 부반지름 (튜브 반지름)
        degree: 270,         // 3/4 토러스 (270도)
        color: [0.8, 0.2, 0.8], // 자주색
        material: MaterialTemplates.MIRROR
    });

    return scene;
}

// ✅ Metal 테스트 씬 - 단순한 2가지 재질만 사용
export function createMetalTestScene(): Scene {
    const scene: Scene = {
        spheres: [],
        cylinders: [],
        boxes: [],
        planes: [],
        circles: [],
        ellipses: [],
        lines: [],
        toruses: []
    };

    // 바닥 평면 (무광 회색)
    scene.planes.push({
        center: [0, -2, 0],
        normal: [0, 1, 0],
        size: [20, 20],
        rotation: [0, 0, 0],
        color: [0.5, 0.5, 0.5], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 금속 구체들
    scene.spheres.push({
        center: [-3, 0, -8],
        radius: 1.0,
        color: [1.0, 0.8, 0.2], // ✅ color → color, 금색
        material: MaterialTemplates.MIRROR
    });

    scene.spheres.push({
        center: [0, 0, -8],
        radius: 1.0,
        color: [0.9, 0.9, 0.9], // ✅ color → color, 은색
        material: MaterialTemplates.MIRROR
    });

    scene.spheres.push({
        center: [3, 0, -8],
        radius: 1.0,
        color: [0.8, 0.5, 0.3], // ✅ color → color, 구리색
        material: MaterialTemplates.MIRROR
    });

    // ✅ 4번째 구체 제거 (VERY_ROUGH_METAL 없음)

    // 비교용 무광 구체
    scene.spheres.push({
        center: [0, 2, -8],
        radius: 0.8,
        color: [0.8, 0.2, 0.2], // ✅ color → color, 빨간색
        material: MaterialTemplates.MATTE
    });

    return scene;
}

// 씬 타입 열거형
export enum SceneType {
    BASIC = "basic",
    RANDOM = "random", 
    MIXED = "mixed",
    SHOWCASE = "showcase",
    METAL_TEST = "metal_test"
}

// 메인 씬 생성 함수
export function createScene(type: SceneType = SceneType.BASIC): Scene {
    switch (type) {
        case SceneType.BASIC:
            return createBasicScene();
        case SceneType.RANDOM:
            return createRandomScene();
        case SceneType.MIXED:
            return createMixedScene();
        case SceneType.SHOWCASE:
            return createShowcaseScene();
        case SceneType.METAL_TEST:
            return createMetalTestScene();
        default:
            return createBasicScene();
    }
}