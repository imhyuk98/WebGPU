import { Scene, Sphere, Cylinder, Box, Plane, Circle, Ellipse, Line, ConeGeometry, Torus, TorusInput, BezierPatch, HermiteBezierPatch } from "./renderer";
import { Material, MaterialType, MaterialTemplates } from "./material";
import { vec3, normalize, toRadians, createTestBezierPatch, createTestHermitePatch, hermiteToBezierPatch, createHermitePatchFromAdvancedParams } from "./utils";
import { WorldPrimitives } from "./importer";

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
    // Accept either angleDegree (degrees) or angle (already radians) for flexibility
    const angle = (input as any).angle !== undefined ? (input as any).angle : degToRad(input.angleDegree ?? 360);
    // Derive basis from either provided xdir/ydir (future) or legacy rotation Euler
    let xdir: vec3 | undefined = (input as any).xdir;
    let ydir: vec3 | undefined = (input as any).ydir;
    if (!xdir) xdir = [1,0,0];
    const Lx = Math.hypot(xdir[0],xdir[1],xdir[2]);
    if (Lx < 1e-6) xdir = [1,0,0]; else xdir = [xdir[0]/Lx,xdir[1]/Lx,xdir[2]/Lx];
    // If ydir given, treat it as a secondary to form a preliminary normal; else pick ref
    let normal: vec3;
    if (ydir) {
        // normal = xdir × ydir (user rule: ydir will be replaced later by xdir × normal)
        normal = [xdir[1]*ydir[2]-xdir[2]*ydir[1], xdir[2]*ydir[0]-xdir[0]*ydir[2], xdir[0]*ydir[1]-xdir[1]*ydir[0]];
        const Ln = Math.hypot(normal[0],normal[1],normal[2]);
        if (Ln < 1e-6) normal = Math.abs(xdir[1]) < 0.9 ? [0,1,0] : [0,0,1]; else normal = [normal[0]/Ln, normal[1]/Ln, normal[2]/Ln];
    } else {
        normal = [0,1,0];
        if (Math.abs(xdir[1]) > 0.9) normal = [0,0,1];
    }
    // ydir = xdir × normal
    ydir = [xdir[1]*normal[2]-xdir[2]*normal[1], xdir[2]*normal[0]-xdir[0]*normal[2], xdir[0]*normal[1]-xdir[1]*normal[0]];
    let Ly = Math.hypot(ydir[0],ydir[1],ydir[2]);
    if (Ly < 1e-6) {
        // fallback orthogonal
        ydir = Math.abs(xdir[0]) < 0.9 ? [0,1,0] : [0,0,1];
        const dp = xdir[0]*ydir[0]+xdir[1]*ydir[1]+xdir[2]*ydir[2];
        ydir = [ydir[0]-xdir[0]*dp, ydir[1]-xdir[1]*dp, ydir[2]-xdir[2]*dp];
        Ly = Math.hypot(ydir[0],ydir[1],ydir[2]);
        if (Ly < 1e-6) ydir = [0,1,0], Ly = 1;
    }
    ydir = [ydir[0]/Ly, ydir[1]/Ly, ydir[2]/Ly];
    return {
        center: input.center,
        xdir,
        ydir,
        majorRadius: input.majorRadius,
        minorRadius: input.minorRadius,
        angle,
        color: input.color,
        material: input.material
    } as any; // Torus interface updated elsewhere
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

    // 🏠 바닥 평면
    // 기존: normal=(0,0,1) + rotation=(PI/2,0,0) 로 수평면 구현 → 이제 rotation 폐기, 직접 수평 normal 사용
    // 월드 좌표: Y가 위, Z가 -앞 방향. 바닥은 Y= -2 아래쪽에 놓고 normal=(0,1,0)
    scene.planes.push({
        center: [0, -2, -8],      // 객체들 기준 아래쪽으로 이동
        normal: [0, 1, 0],        // 위로 향하는 법선
        size: [120, 120],         // 넓은 바닥
        xdir: [1, 0, 0],          // U 축 (가로)
        ydir: [0, 0, -1],         // V 축 (카메라 쪽이 -Z 이므로 오른손계 유지 위해 -Z)
        rotation: [0,0,0],        // legacy (무시)
        color: [0.6, 0.4, 0.8],
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

    // 🟡 세로 Plane (우측 Billboard)
    scene.planes.push({
        center: [4, 0, -8],
        normal: [0, 0, 1],
        size: [2.5, 2.5],
        xdir: [1,0,0],            // 오른쪽
        ydir: [0,1,0],            // 위쪽
        rotation: [0,0,0],
        color: [0.7, 0.7, 0.9],
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
        center: [22, 0, -8],
        xdir: [1,0,0],
        ydir: [0,1,0],
        majorRadius: 1.0,
        minorRadius: 0.3,
        angleDegree: 180,
        color: [0.8, 0.2, 0.8],
        material: MaterialTemplates.MATTE
    };
    scene.toruses.push(convertTorusInput(torusInput1));

    // 🔸 1/4 토러스 (단순한 방식)
    const torusInput2: TorusInput = {
        center: [26, 0, -8],
        xdir: [0,0,1], // alternate orientation
        ydir: [0,1,0],
        majorRadius: 0.8,
        minorRadius: 0.2,
        angleDegree: 90,
        color: [0.2, 0.8, 0.8],
        material: MaterialTemplates.MATTE
    };
    scene.toruses.push(convertTorusInput(torusInput2));

    // 🔹 3/4 토러스 - rotation으로 시작 방향 조정 (단순한 방식)
    const torusInput3: TorusInput = {
        center: [30, 0, -8],
        xdir: [Math.SQRT1_2,0,Math.SQRT1_2], // rotated 45 deg around Y
        ydir: [0,1,0],
        majorRadius: 0.6,
        minorRadius: 0.15,
        angleDegree: 270,
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
                
                // 랜덤한 기준 벡터 (xdir)
                let xdir: vec3 = [random_double(-1,1), random_double(-1,1), random_double(-1,1)];
                let nx = Math.hypot(xdir[0],xdir[1],xdir[2]);
                if (nx < 1e-6) xdir = [1,0,0]; else xdir = [xdir[0]/nx,xdir[1]/nx,xdir[2]/nx];
                // 랜덤 보조로 ydir 생성 후 정규직교화
                let yseed: vec3 = [random_double(-1,1), random_double(-1,1), random_double(-1,1)];
                let dpx = xdir[0]*yseed[0]+xdir[1]*yseed[1]+xdir[2]*yseed[2];
                let ydir: vec3 = [yseed[0]-xdir[0]*dpx, yseed[1]-xdir[1]*dpx, yseed[2]-xdir[2]*dpx];
                let ny = Math.hypot(ydir[0],ydir[1],ydir[2]);
                if (ny < 1e-6) ydir = [0,1,0]; else ydir = [ydir[0]/ny, ydir[1]/ny, ydir[2]/ny];
                // 크기 변화를 위한 랜덤 값
                const sizeVariation = random_double(0.8, 1.2);
                toruses.push({
                    center: position,
                    xdir,
                    ydir,
                    majorRadius: 1.5 * sizeVariation,
                    minorRadius: 0.5 * sizeVariation,
                    angle: Math.PI * 2,
                    color: colors[colorIndex],
                    material: material
                } as any);
                
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

/**
 * 파싱된 WorldPrimitives 데이터로부터 렌더링 가능한 Scene 객체를 생성합니다.
 * @param world - extractWorldPrimitives 함수로부터 반환된 데이터
 * @returns 렌더러가 사용할 수 있는 Scene 객체
 */
export function createSceneFromWorld(world: WorldPrimitives): Scene {
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
    };

    const defaultMaterial = MaterialTemplates.MATTE;
    const defaultColor: vec3 = [0.8, 0.8, 0.8]; // 밝은 회색

    // WorldPrimitives의 각 도형 배열을 Scene의 형식에 맞게 변환합니다.
    world.spheres.forEach(s => scene.spheres.push({
        center: s.center,
        radius: s.radius,
        color: defaultColor,
        material: defaultMaterial
    }));

    world.cylinders.forEach(c => scene.cylinders.push({
        center: c.center,
        axis: c.axis,
        height: c.height,
        radius: c.radius,
        color: defaultColor,
        material: defaultMaterial
    }));

    world.planes.forEach(p => scene.planes.push({
        center: p.center,
        normal: p.normal,
        size: p.size ?? [10, 10],
        xdir: p.xdir,  // now imported
        ydir: p.ydir,  // now imported
        rotation: [0, 0, 0], // legacy
        color: defaultColor,
        material: defaultMaterial
    }));

    if (world.planes.length) {
        console.groupCollapsed(`[Scene] Imported ${world.planes.length} planes with tangents`);
        world.planes.forEach((p,i)=>{
            console.log(`Plane[${i}] center=${p.center.map(v=>v.toFixed(3))} n=${p.normal.map(v=>v.toFixed(3))} xdir=${p.xdir?p.xdir.map(v=>v.toFixed(3)):'-'} ydir=${p.ydir?p.ydir.map(v=>v.toFixed(3)):'-'} size=${p.size?p.size.join('x'):'-'} `);
        });
        console.groupEnd();
    }

    world.circles.forEach(c => scene.circles.push({
        center: c.center,
        normal: c.normal,
        radius: c.radius,
        color: defaultColor,
        material: defaultMaterial
    }));

    world.ellipses.forEach(e => scene.ellipses.push({
        center: e.center,
        normal: e.normal,
        radiusA: e.radiusA,
        radiusB: e.radiusB,
        rotation: e.xdir ? [0,0,0] : [0,0,0], // TODO: xdir로부터 회전 계산
        color: defaultColor,
        material: defaultMaterial
    }));

    world.lines.forEach(l => scene.lines.push({
        start: l.start,
        end: l.end,
        thickness: l.thickness ?? 0.02, // 기본 두께
        color: defaultColor,
        material: defaultMaterial
    }));

    world.cones.forEach(c => scene.cones.push({
        center: c.center,
        axis: c.axis,
        height: c.height,
        radius: c.radius,
        color: defaultColor,
        material: defaultMaterial
    }));

    if (world.toruses) {
        world.toruses.forEach(t => {
            const xdir = (t as any).xdir as vec3 | undefined;
            const ydir = (t as any).ydir as vec3 | undefined;
            if (typeof (window as any) !== 'undefined' && (window as any).DEBUG_TORUS_BASIS) {
                console.log(`[SceneImport:Torus] center=${t.center.map(v=>v.toFixed(3))} X=${xdir?xdir.map(n=>n.toFixed(3)):'-'} Y=${ydir?ydir.map(n=>n.toFixed(3)):'-'} angleDeg=${t.angleDeg}`);
            }
            scene.toruses.push({
                center: t.center,
                xdir: xdir as vec3,
                ydir: ydir as vec3,
                majorRadius: t.majorRadius,
                minorRadius: t.minorRadius,
                angle: toRadians(t.angleDeg),
                color: defaultColor,
                material: defaultMaterial
            } as any);
        });
    }

    // TODO: 다른 프리미티브 타입(예: Bezier)에 대한 변환 추가

    return scene;
}

