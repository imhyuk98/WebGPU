import { Scene, Sphere, Cylinder, Box, Plane, Circle, Ellipse, Line, ConeGeometry, Torus, TorusInput, BezierPatch, HermiteBezierPatch } from "./renderer";
import { Material, MaterialType, MaterialTemplates } from "./material";
import { vec3, normalize, toRadians, createTestBezierPatch, createTestHermitePatch, hermiteToBezierPatch, createHermitePatchFromAdvancedParams } from "./utils";

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
        toruses: [],
        bezierPatches: []
    } as Scene;

    // 🏠 바닥 평면 (회색) - 카메라 앞쪽 아래에 배치
    scene.planes.push({
        center: [0, 10, -8],
        normal: [0, 0, 1],
        size: [120, 60], // 80x40 → 120x60 (더욱 넓게)
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

    // 🔶 Bézier Patch - Cone 오른쪽에 배치하여 도형들을 나열
    const testPatch = createTestBezierPatch([38, 0, -8], 2.0); // Cone 오른쪽, 같은 Z 라인
    scene.bezierPatches.push(testPatch);

    // 🔷 Hermite Bézier Patch - 빨간색 패치와 비슷한 안장 모양으로 조정
    const advancedHermitePatch = createHermitePatchFromAdvancedParams(
        // 1) 네 꼭짓점의 파라미터 (u,v) 값 - 제시하신 코드와 동일한 방식
        {
            p00: { u: 0.0, v: 0.0 },  // P00: (u0, v0)
            pM0: { u: 1.0, v: 0.0 },  // P_M0: (uM, v0)
            p0N: { u: 0.0, v: 1.0 },  // P_0N: (u0, vN)
            pMN: { u: 1.0, v: 1.0 }   // P_MN: (uM, vN)
        },
        // 2) 네 꼭짓점의 위치(Points) - 빨간색 패치와 같은 안장 모양 구조
        {
            p00: [41.0, -0.2, -9.0],  // 왼쪽 아래 (안장의 낮은 부분)
            pM0: [43.0, -0.2, -9.0],  // 오른쪽 아래 (안장의 낮은 부분)
            p0N: [41.0, -0.2, -7.0],  // 왼쪽 위 (안장의 낮은 부분)
            pMN: [43.0, -0.2, -7.0]   // 오른쪽 위 (안장의 낮은 부분)
        },
        // 3) 네 꼭짓점의 u-접선(∂P/∂u) - 안장 모양을 위한 접선
        {
            tu00: [2.0,  0.6,  0.0],  // 왼쪽 아래에서 u 방향 접선 (위로 올라가는 곡률)
            tuM0: [2.0, -0.6,  0.0],  // 오른쪽 아래에서 u 방향 접선 (아래로 내려가는 곡률)
            tu0N: [2.0, -0.6,  0.0],  // 왼쪽 위에서 u 방향 접선 (아래로 내려가는 곡률)
            tuMN: [2.0,  0.6,  0.0]   // 오른쪽 위에서 u 방향 접선 (위로 올라가는 곡률)
        },
        // 4) 네 꼭짓점의 v-접선(∂P/∂v) - 안장 모양을 위한 접선
        {
            tv00: [0.0,  0.6,  2.0],  // 왼쪽 아래에서 v 방향 접선 (위로 올라가는 곡률)
            tvM0: [0.0,  0.6,  2.0],  // 오른쪽 아래에서 v 방향 접선 (위로 올라가는 곡률)
            tv0N: [0.0, -0.6,  2.0],  // 왼쪽 위에서 v 방향 접선 (아래로 내려가는 곡률)
            tvMN: [0.0, -0.6,  2.0]   // 오른쪽 위에서 v 방향 접선 (아래로 내려가는 곡률)
        },
        // 5) 네 꼭짓점의 혼합 도함수(∂²P/∂u∂v) - 안장 모양의 비틀림
        {
            tuv00: [0.0,  0.0,  0.0], // 왼쪽 아래에서 혼합 도함수 (작은 비틀림)
            tuvM0: [0.0,  0.0,  0.0], // 오른쪽 아래에서 혼합 도함수 (작은 비틀림)
            tuv0N: [0.0,  0.0,  0.0], // 왼쪽 위에서 혼합 도함수 (작은 비틀림)
            tuvMN: [0.0,  0.0,  0.0]  // 오른쪽 위에서 혼합 도함수 (작은 비틀림)
        },
        // 6) 색상과 재질
        [0.8, 0.2, 0.8], // 보라색으로 구분
        MaterialTemplates.MATTE
    );
    const convertedAdvancedPatch = hermiteToBezierPatch(advancedHermitePatch);
    scene.bezierPatches.push(convertedAdvancedPatch);

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
        toruses: [],
        bezierPatches: []
    } as Scene;

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
    SHOWCASE = "showcase",
    METAL_TEST = "metal_test",
    TORUS_FIELD = "torus_field"
}

// 메인 씬 생성 함수
export function createScene(type: SceneType = SceneType.SHOWCASE): Scene {
    switch (type) {
        case SceneType.SHOWCASE:
            return createShowcaseScene();
        case SceneType.METAL_TEST:
            return createMetalTestScene();
        case SceneType.TORUS_FIELD:
            return createTorusFieldScene();
        default:
            return createShowcaseScene();
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
        toruses: toruses.map(convertTorusInput),
        bezierPatches: []
    } as Scene;
}

