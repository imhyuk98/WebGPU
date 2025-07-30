import { Scene, Sphere, Cylinder, Box, Plane, Circle, Ellipse, Line, ConeGeometry, Torus, TorusInput } from "./renderer";
import { Material, MaterialType, MaterialTemplates } from "./material";
import { vec3, normalize, toRadians } from "./utils";

// --- Helper Functions ---
function random_double(min: number, max: number): number {
    return min + (max - min) * Math.random();
}

function random_vec3(min: number, max: number): vec3 {
    return [random_double(min, max), random_double(min, max), random_double(min, max)];
}

// 도를 라디안으로 변환
function degToRad(degrees: number): number {
    return degrees * Math.PI / 180;
}

// TorusInput을 Torus로 변환 (도 → 라디안)
function convertTorusInput(input: TorusInput): Torus {
    // angle 계산 (항상 0도부터 시작)
    let angle: number;

    if (input.angleDegree !== undefined) {
        angle = degToRad(input.angleDegree);
    } else {
        // 기본값: 완전한 도넛 (360도)
        angle = degToRad(360);
    }

    return {
        center: input.center,
        rotation: input.rotation || [0, 0, 0],
        majorRadius: input.majorRadius,
        minorRadius: input.minorRadius,
        angle,
        color: input.color,
        material: input.material
    };
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
        cones: [],
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

    // 테스트용 Cone 추가
    scene.cones.push({
        center: [2, 2, 0],       // 원뿔의 꼭짓점
        axis: [0, 1, 0],        // 아래쪽을 향하는 축
        height: 3,               // 높이 3
        radius: 1.5,             // 밑면 반지름 1.5
        color: [1.0, 0.5, 0.0],  // 주황색
        material: MaterialTemplates.MATTE
    } as ConeGeometry);

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
        cones: [],
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
        cones: [],
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
        cones: [],
        toruses: []
    };

    // 🏠 바닥 평면 (회색) - 카메라 앞쪽 아래에 배치
    scene.planes.push({
        center: [0, 10, -8],
        normal: [0, 0, 1],
        size: [80, 40], // 40x20 → 80x40 (훨씬 크게)
        rotation: [Math.PI/2, 0, 0],
        color: [0.6, 0.4, 0.8], // 연한 보라색 (사용되지 않은 색상)
        material: MaterialTemplates.MATTE
    });

    // 🔴 Sphere (구) - 왼쪽
    scene.spheres.push({
        center: [-8, 0, -8], // -4 → -8 (더 멀리)
        radius: 1.0,
        color: [1.0, 0.2, 0.2], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 🟢 Cylinder (실린더) - 중앙 왼쪽
    scene.cylinders.push({
        center: [-4, 0, -8], // -1 → -4 (간격 넓힘)
        axis: [0, 1, 0],
        height: 2.0,
        radius: 0.6,
        color: [0.2, 1.0, 0.2], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 🔵 Box (박스) - 중앙 오른쪽
    scene.boxes.push({
        center: [0, 0, -8], // 2 → 0 (중앙으로)
        size: [1.2, 1.2, 1.2],
        rotation: [0, Math.PI/4, Math.PI/6],
        color: [0.2, 0.2, 1.0], // ✅ color → color
        material: MaterialTemplates.MATTE // ✅ ROUGH_METAL → MIRROR
    });

    // 🟡 Plane (평면) - 오른쪽, 카메라를 향하도록
    scene.planes.push({
        center: [4, 0, -8], // 5 → 4
        normal: [0, 0, 1],
        size: [2.5, 2.5],
        rotation: [0, 0, 0],
        color: [1.0, 1.0, 0.2], // ✅ color → color
        material: MaterialTemplates.MATTE
    });

    // 🟠 Circle (원) - 맨 오른쪽, sphere와 같은 높이 및 반지름
    scene.circles.push({
        center: [8, 0, -8], // 그대로 유지
        radius: 1.0, // sphere와 같은 반지름
        normal: [0, 0, 1], // Z축을 향하도록 (카메라 쪽)
        color: [1.0, 0.5, 0.2], // 주황색
        material: MaterialTemplates.MATTE
    });

    // 🟡 Ellipse (타원) - Circle 옆에 추가
    scene.ellipses.push({
        center: [14, 0, -8], // 12 → 14 (더 멀리)
        radiusA: 1.5, // 장축 반지름 (가로)
        radiusB: 0.8, // 단축 반지름 (세로)
        normal: [0, 0, 1], // Z축을 향하도록 (카메라 쪽)
        rotation: [0, 0, 0.5], // Z축 중심으로 약간 회전 (약 28.6도)
        color: [1.0, 1.0, 0.2], // 밝은 노란색
        material: MaterialTemplates.MATTE // 거울 재질 → 무광 재질로 변경
    });

    // 🟤 Line (선) - Ellipse 옆에 추가
    scene.lines.push({
        start: [18, -1, -8], // 14 → 18 (더 멀리)
        end: [18, 1, -8],    // 위쪽으로 2 단위 길이
        thickness: 0.005,     // 훨씬 얇은 두께 (0.1 → 0.02)
        color: [0.6, 0.3, 0.1], // 갈색
        material: MaterialTemplates.MATTE
    });

    // 🟣 Torus (토러스) - 반원 도넛 (단순한 방식)
    const torusInput1: TorusInput = {
        center: [22, 0, -8], // 16 → 22 (더 멀리)
        rotation: [Math.PI/4, 0, Math.PI/6], // 토러스 자체를 기울임
        majorRadius: 1.0,
        minorRadius: 0.3,
        angleDegree: 180,    // 🔥 180도만 그리기 (0도부터)
        color: [0.8, 0.2, 0.8],
        material: MaterialTemplates.MATTE
    };
    scene.toruses.push(convertTorusInput(torusInput1));

    // 🔸 1/4 토러스 (단순한 방식)
    const torusInput2: TorusInput = {
        center: [26, 0, -8], // 18 → 26 (더 멀리)
        rotation: [0, 0, 0],      // 회전 없음
        majorRadius: 0.8,
        minorRadius: 0.2,
        angleDegree: 90,     // 🔥 90도만 그리기 (0도부터)
        color: [0.2, 0.8, 0.8],
        material: MaterialTemplates.MATTE
    };
    scene.toruses.push(convertTorusInput(torusInput2));

    // 🔹 3/4 토러스 - rotation으로 시작 방향 조정 (단순한 방식)
    const torusInput3: TorusInput = {
        center: [30, 0, -8], // 20 → 30 (더 멀리)
        rotation: [0, 0, Math.PI/4], // Z축 중심으로 45도 회전 (시작점이 45도가 됨)
        majorRadius: 0.6,
        minorRadius: 0.15,
        angleDegree: 270,    // 🔥 270도 그리기 (45도부터 시작하는 효과)
        color: [1.0, 0.8, 0.2],
        material: MaterialTemplates.MATTE
    };
    scene.toruses.push(convertTorusInput(torusInput3));

    // 🔻 Cone (원뿔) - 토러스 옆에 추가
    scene.cones.push({
        center: [34, 0, -8], // 토러스 다음 위치
        axis: [0, 1, 0], // Y축 방향 (위를 향함)
        height: 2.0,
        radius: 1.0,
        color: [0.9, 0.3, 0.1], // 주황-빨강색
        material: MaterialTemplates.MATTE
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
        cones: [],
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
    METAL_TEST = "metal_test",
    TORUS_FIELD = "torus_field",
    TORUS_1000 = "torus_1000"
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
        case SceneType.TORUS_FIELD:
            return createTorusFieldScene();
        case SceneType.TORUS_1000:
            return createTorus1000Scene();
        default:
            return createBasicScene();
    }
}

// 1000개의 토러스를 격자로 배치한 성능 테스트 Scene
function createTorusFieldScene(): Scene {
    console.log("Creating Torus Field Scene with 1000 toruses...");
    
    const toruses: TorusInput[] = [];
    
    // 10x10x10 = 1000개의 토러스를 격자로 배치
    const gridSize = 10;
    const spacing = 6; // 토러스 간 간격
    const totalSize = (gridSize - 1) * spacing;
    const offset = totalSize / 2; // 중앙 정렬
    
    // 다양한 색상 팔레트
    const colors: vec3[] = [
        [1.0, 0.2, 0.2], // 빨강
        [0.2, 1.0, 0.2], // 초록
        [0.2, 0.2, 1.0], // 파랑
        [1.0, 1.0, 0.2], // 노랑
        [1.0, 0.2, 1.0], // 마젠타
        [0.2, 1.0, 1.0], // 시안
        [1.0, 0.6, 0.2], // 주황
        [0.6, 0.2, 1.0], // 보라
        [0.2, 0.6, 1.0], // 하늘색
        [1.0, 0.8, 0.6], // 베이지
    ];
    
    // 재질은 MATTE만 사용 (통일성을 위해)
    const material = MaterialTemplates.MATTE;
    
    let torusIndex = 0;
    
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            for (let z = 0; z < gridSize; z++) {
                // 위치 계산
                const position: vec3 = [
                    x * spacing - offset,
                    y * spacing - offset,
                    z * spacing - offset
                ];
                
                // 색상과 재질을 인덱스 기반으로 선택
                const colorIndex = torusIndex % colors.length;
                
                // 랜덤한 회전
                const rotation: vec3 = [
                    random_double(0, Math.PI * 2),
                    random_double(0, Math.PI * 2),
                    random_double(0, Math.PI * 2)
                ];
                
                // 크기 변화를 위한 랜덤 값
                const sizeVariation = random_double(0.8, 1.2);
                
                toruses.push({
                    center: position,
                    rotation: rotation,
                    majorRadius: 1.5 * sizeVariation, // 주반지름
                    minorRadius: 0.5 * sizeVariation, // 부반지름
                    angleDegree: 360, // 완전한 도넛
                    color: colors[colorIndex],
                    material: material // 모두 MATTE 재질
                });
                
                torusIndex++;
            }
        }
    }
    
    console.log(`Created ${toruses.length} toruses in a ${gridSize}x${gridSize}x${gridSize} grid`);
    
    // 큰 바닥 평면 추가 (성능에 큰 영향 없음)
    const planes: Plane[] = [
        {
            center: [0, -offset - 10, 0],
            normal: [0, 1, 0],
            size: [totalSize * 2, totalSize * 2],
            rotation: [0, 0, 0],
            color: [0.3, 0.3, 0.3],
            material: MaterialTemplates.MATTE
        }
    ];
    
    return {
        spheres: [],
        cylinders: [],
        boxes: [],
        planes: planes,
        circles: [],
        ellipses: [],
        lines: [],
        cones: [],
        toruses: toruses.map(convertTorusInput)
    };
}

// 성능 최적화된 125개 토러스 Scene
function createTorus1000Scene(): Scene {
    console.log("Creating Optimized Torus Scene (125 toruses)");
    
    const toruses: TorusInput[] = [];
    
    // 5x5x5 = 125개의 토러스를 격자로 배치 (최적화된 버전)
    const gridSize = 5;
    const spacing = 8; // 토러스 간 간격
    const totalSize = (gridSize - 1) * spacing;
    const offset = totalSize / 2; // 중앙 정렬
    
    // 더 간단한 색상 팔레트 (성능을 위해)
    const colors: vec3[] = [
        [1.0, 0.2, 0.2], // 빨강
        [0.2, 1.0, 0.2], // 초록
        [0.2, 0.2, 1.0], // 파랑
        [1.0, 1.0, 0.2], // 노랑
        [0.6, 0.6, 0.6], // 회색
    ];
    
    // 재질은 MATTE만 사용 (성능을 위해)
    const material = MaterialTemplates.MATTE;
    
    let torusIndex = 0;
    
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            for (let z = 0; z < gridSize; z++) {
                // 위치 계산
                const position: vec3 = [
                    x * spacing - offset,
                    y * spacing - offset,
                    z * spacing - offset
                ];
                
                // 색상을 인덱스 기반으로 선택
                const colorIndex = torusIndex % colors.length;
                
                // 단순한 회전 (성능을 위해)
                const rotation: vec3 = [
                    (x / gridSize) * Math.PI,
                    (y / gridSize) * Math.PI,
                    (z / gridSize) * Math.PI
                ];
                
                // 고정된 크기 (성능을 위해)
                toruses.push({
                    center: position,
                    rotation: rotation,
                    majorRadius: 1.2, // 주반지름
                    minorRadius: 0.4, // 부반지름
                    angleDegree: 360, // 완전한 도넛
                    color: colors[colorIndex],
                    material: material
                });
                
                torusIndex++;
            }
        }
    }
    
    console.log(`Created ${toruses.length} toruses for performance testing`);
    
    return {
        spheres: [],
        cylinders: [],
        boxes: [],
        planes: [], // 바닥 제거 (성능을 위해)
        circles: [],
        ellipses: [],
        lines: [],
        cones: [],
        toruses: toruses.map(convertTorusInput)
    };
}