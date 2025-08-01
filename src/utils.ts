// Vector math utilities for 3D calculations
import { Material, MaterialTemplates } from "./material";

// Helper types and functions for vector math
export type vec3 = [number, number, number];

export const vec3 = (x: number, y: number, z: number): vec3 => [x, y, z];

export const add = (a: vec3, b: vec3): vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const subtract = (a: vec3, b: vec3): vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale = (a: vec3, s: number): vec3 => [a[0] * s, a[1] * s, a[2] * s];

export const length = (a: vec3): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);

export const normalize = (a: vec3): vec3 => {
    const l = length(a);
    return l > 0 ? scale(a, 1 / l) : vec3(0, 0, 0);
};

// Cross product for vector calculations
export const cross = (a: vec3, b: vec3): vec3 => {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
};

// Dot product for vector calculations
export const dot = (a: vec3, b: vec3): number => {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

// Distance between two points
export const distance = (a: vec3, b: vec3): number => {
    return length(subtract(a, b));
};

// Linear interpolation between two vectors
export const lerp = (a: vec3, b: vec3, t: number): vec3 => {
    return add(scale(a, 1 - t), scale(b, t));
};

// Convert degrees to radians
export const toRadians = (degrees: number): number => {
    return degrees * (Math.PI / 180);
};

// Convert radians to degrees
export const toDegrees = (radians: number): number => {
    return radians * (180 / Math.PI);
};

// Clamp a value between min and max
export const clamp = (value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
};

// Reflect a vector around a normal
export const reflect = (incident: vec3, normal: vec3): vec3 => {
    const dotProduct = dot(incident, normal);
    return subtract(incident, scale(normal, 2 * dotProduct));
};

// === Frustum Culling Utilities ===

// Plane representation: ax + by + cz + d = 0
export interface Plane {
    normal: vec3;  // [a, b, c] - normalized normal vector
    distance: number;  // d - distance from origin
}

// Camera frustum represented by 6 planes
export interface Frustum {
    planes: Plane[];  // [left, right, bottom, top, near, far]
}

// Bounding sphere for objects
export interface BoundingSphere {
    center: vec3;
    radius: number;
}

// Create a frustum from camera parameters
export const createFrustum = (
    cameraPos: vec3,
    lookAt: vec3,
    up: vec3,
    fov: number,  // in degrees
    aspectRatio: number,
    nearPlane: number,
    farPlane: number
): Frustum => {
    // Convert FOV to radians
    const fovRad = toRadians(fov);
    const halfHeight = Math.tan(fovRad / 2);
    const halfWidth = halfHeight * aspectRatio;
    
    // Camera basis vectors
    const forward = normalize(subtract(lookAt, cameraPos));
    const right = normalize(cross(forward, up));
    const cameraUp = cross(right, forward);
    
    // Frustum corners at near and far planes
    const nearCenter = add(cameraPos, scale(forward, nearPlane));
    const farCenter = add(cameraPos, scale(forward, farPlane));
    
    const nearHeight = halfHeight * nearPlane;
    const nearWidth = halfWidth * nearPlane;
    const farHeight = halfHeight * farPlane;
    const farWidth = halfWidth * farPlane;
    
    // Near plane corners
    const nearTL = add(add(nearCenter, scale(cameraUp, nearHeight)), scale(right, -nearWidth));
    const nearTR = add(add(nearCenter, scale(cameraUp, nearHeight)), scale(right, nearWidth));
    const nearBL = add(add(nearCenter, scale(cameraUp, -nearHeight)), scale(right, -nearWidth));
    const nearBR = add(add(nearCenter, scale(cameraUp, -nearHeight)), scale(right, nearWidth));
    
    // Far plane corners
    const farTL = add(add(farCenter, scale(cameraUp, farHeight)), scale(right, -farWidth));
    const farTR = add(add(farCenter, scale(cameraUp, farHeight)), scale(right, farWidth));
    const farBL = add(add(farCenter, scale(cameraUp, -farHeight)), scale(right, -farWidth));
    const farBR = add(add(farCenter, scale(cameraUp, -farHeight)), scale(right, farWidth));
    
    // Calculate plane normals (pointing inward)
    const planes: Plane[] = [
        // Left plane: nearTL -> nearBL -> farBL
        createPlaneFromPoints(nearTL, nearBL, farBL),
        // Right plane: nearBR -> nearTR -> farTR
        createPlaneFromPoints(nearBR, nearTR, farTR),
        // Bottom plane: nearBL -> nearBR -> farBR
        createPlaneFromPoints(nearBL, nearBR, farBR),
        // Top plane: nearTR -> nearTL -> farTL
        createPlaneFromPoints(nearTR, nearTL, farTL),
        // Near plane
        { normal: forward, distance: -dot(forward, nearCenter) },
        // Far plane
        { normal: scale(forward, -1), distance: dot(forward, farCenter) }
    ];
    
    return { planes };
};

// Create a plane from three points
const createPlaneFromPoints = (p1: vec3, p2: vec3, p3: vec3): Plane => {
    const v1 = subtract(p2, p1);
    const v2 = subtract(p3, p1);
    const normal = normalize(cross(v1, v2));
    const distance = -dot(normal, p1);
    return { normal, distance };
};

// Test if a sphere is inside the frustum
export const sphereInFrustum = (sphere: BoundingSphere, frustum: Frustum): boolean => {
    for (const plane of frustum.planes) {
        const distanceToPlane = dot(plane.normal, sphere.center) + plane.distance;
        if (distanceToPlane < -sphere.radius) {
            return false; // Sphere is completely outside this plane
        }
    }
    return true; // Sphere is inside or intersecting the frustum
};

// Get bounding sphere for different object types
export const getBoundingSphereForSphere = (center: vec3, radius: number): BoundingSphere => ({
    center,
    radius
});

export const getBoundingSphereForBox = (center: vec3, size: vec3): BoundingSphere => ({
    center,
    radius: length(scale(size, 0.5)) // Half diagonal of the box
});

export const getBoundingSphereForCylinder = (center: vec3, radius: number, height: number): BoundingSphere => ({
    center,
    radius: Math.max(radius, height / 2) // Conservative estimate
});

export const getBoundingSphereForTorus = (center: vec3, majorRadius: number, minorRadius: number): BoundingSphere => ({
    center,
    radius: majorRadius + minorRadius
});

// === Bézier Patch Utilities ===

// 4x4 control points matrix type
export type ControlPointMatrix = vec3[][];

// Standard Bézier patch represented by 4x4 control points
export interface BezierPatch {
    controlPoints: ControlPointMatrix;  // 16 control points (4x4 matrix)
    boundingBox: {
        min: vec3;
        max: vec3;
    };
    color: vec3;
    material: Material;
}

// Advanced Hermite-style Bézier patch (like your reference code)
export interface HermiteBezierPatch {
    // Corner parameters (u,v)
    corners: {
        p00: { u: number; v: number; };  // P00: (u0, v0)
        pM0: { u: number; v: number; };  // P_M0: (uM, v0)
        p0N: { u: number; v: number; };  // P_0N: (u0, vN)
        pMN: { u: number; v: number; };  // P_MN: (uM, vN)
    };
    
    // Corner positions (XYZ ×4)
    positions: {
        p00: vec3;  // Position at (u0, v0)
        pM0: vec3;  // Position at (uM, v0)
        p0N: vec3;  // Position at (u0, vN)
        pMN: vec3;  // Position at (uM, vN)
    };
    
    // u-direction tangents (∂P/∂u) at corners (XYZ ×4)
    uTangents: {
        tu00: vec3;  // ∂P/∂u at (u0, v0)
        tuM0: vec3;  // ∂P/∂u at (uM, v0)
        tu0N: vec3;  // ∂P/∂u at (u0, vN)
        tuMN: vec3;  // ∂P/∂u at (uM, vN)
    };
    
    // v-direction tangents (∂P/∂v) at corners (XYZ ×4)
    vTangents: {
        tv00: vec3;  // ∂P/∂v at (u0, v0)
        tvM0: vec3;  // ∂P/∂v at (uM, v0)
        tv0N: vec3;  // ∂P/∂v at (u0, vN)
        tvMN: vec3;  // ∂P/∂v at (uM, vN)
    };
    
    // Mixed derivatives (∂²P/∂u∂v) at corners (XYZ ×4)
    mixedDerivatives: {
        tuv00: vec3;  // ∂²P/∂u∂v at (u0, v0)
        tuvM0: vec3;  // ∂²P/∂u∂v at (uM, v0)
        tuv0N: vec3;  // ∂²P/∂u∂v at (u0, vN)
        tuvMN: vec3;  // ∂²P/∂u∂v at (uM, vN)
    };
    
    color: vec3;
    material: Material;
}

// Evaluate Bézier patch at parameters (u, v) using de Casteljau algorithm
export const evaluateBezierPatch = (patch: BezierPatch, u: number, v: number): {
    point: vec3;
    dPu: vec3;  // Partial derivative with respect to u
    dPv: vec3;  // Partial derivative with respect to v
} => {
    // First pass: evaluate along v direction for each row
    const rowCurves: vec3[] = [];
    for (let i = 0; i < 4; i++) {
        const cp = patch.controlPoints[i];
        const a = lerp(cp[0], cp[1], v);
        const b = lerp(cp[1], cp[2], v);
        const c = lerp(cp[2], cp[3], v);
        const d = lerp(a, b, v);
        const e = lerp(b, c, v);
        rowCurves[i] = lerp(d, e, v);
    }

    // Second pass: evaluate along u direction
    const A = lerp(rowCurves[0], rowCurves[1], u);
    const B = lerp(rowCurves[1], rowCurves[2], u);
    const C = lerp(rowCurves[2], rowCurves[3], u);
    const D = lerp(A, B, u);
    const E = lerp(B, C, u);
    const point = lerp(D, E, u);

    // Calculate partial derivatives
    const dPu = scale(subtract(E, D), 3);

    // For dPv, evaluate along u direction first
    const colCurves: vec3[] = [];
    for (let j = 0; j < 4; j++) {
        const a = lerp(patch.controlPoints[0][j], patch.controlPoints[1][j], u);
        const b = lerp(patch.controlPoints[1][j], patch.controlPoints[2][j], u);
        const c = lerp(patch.controlPoints[2][j], patch.controlPoints[3][j], u);
        const d = lerp(a, b, u);
        const e = lerp(b, c, u);
        colCurves[j] = lerp(d, e, u);
    }

    const A2 = lerp(colCurves[0], colCurves[1], v);
    const B2 = lerp(colCurves[1], colCurves[2], v);
    const C2 = lerp(colCurves[2], colCurves[3], v);
    const D2 = lerp(A2, B2, v);
    const E2 = lerp(B2, C2, v);
    const dPv = scale(subtract(E2, D2), 3);

    return { point, dPu, dPv };
};

// Subdivide a Bézier patch into 4 sub-patches
export const subdivideBezierPatch = (patch: BezierPatch): BezierPatch[] => {
    const cp = patch.controlPoints;
    
    // Split horizontally first (u direction)
    const leftHalf: ControlPointMatrix = [[], [], [], []];
    const rightHalf: ControlPointMatrix = [[], [], [], []];

    for (let j = 0; j < 4; j++) {
        const a = cp[0][j];
        const b = cp[1][j];
        const c = cp[2][j];
        const d = cp[3][j];

        const ab = scale(add(a, b), 0.5);
        const bc = scale(add(b, c), 0.5);
        const cd = scale(add(c, d), 0.5);
        const abc = scale(add(ab, bc), 0.5);
        const bcd = scale(add(bc, cd), 0.5);
        const abcd = scale(add(abc, bcd), 0.5);

        leftHalf[0][j] = a;
        leftHalf[1][j] = ab;
        leftHalf[2][j] = abc;
        leftHalf[3][j] = abcd;

        rightHalf[0][j] = abcd;
        rightHalf[1][j] = bcd;
        rightHalf[2][j] = cd;
        rightHalf[3][j] = d;
    }

    // Split each half vertically (v direction)
    const subdivideVertically = (half: ControlPointMatrix): [ControlPointMatrix, ControlPointMatrix] => {
        const bottom: ControlPointMatrix = [[], [], [], []];
        const top: ControlPointMatrix = [[], [], [], []];

        for (let i = 0; i < 4; i++) {
            const a = half[i][0];
            const b = half[i][1];
            const c = half[i][2];
            const d = half[i][3];

            const ab = scale(add(a, b), 0.5);
            const bc = scale(add(b, c), 0.5);
            const cd = scale(add(c, d), 0.5);
            const abc = scale(add(ab, bc), 0.5);
            const bcd = scale(add(bc, cd), 0.5);
            const abcd = scale(add(abc, bcd), 0.5);

            bottom[i][0] = a;
            bottom[i][1] = ab;
            bottom[i][2] = abc;
            bottom[i][3] = abcd;

            top[i][0] = abcd;
            top[i][1] = bcd;
            top[i][2] = cd;
            top[i][3] = d;
        }

        return [bottom, top];
    };

    const [leftBottom, leftTop] = subdivideVertically(leftHalf);
    const [rightBottom, rightTop] = subdivideVertically(rightHalf);

    // Calculate bounding boxes for each sub-patch
    const calculateBoundingBox = (controlPoints: ControlPointMatrix) => {
        let min: vec3 = [...controlPoints[0][0]] as vec3;
        let max: vec3 = [...controlPoints[0][0]] as vec3;

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const p = controlPoints[i][j];
                min = [Math.min(min[0], p[0]), Math.min(min[1], p[1]), Math.min(min[2], p[2])];
                max = [Math.max(max[0], p[0]), Math.max(max[1], p[1]), Math.max(max[2], p[2])];
            }
        }

        return { min, max };
    };

    return [
        { controlPoints: leftBottom, boundingBox: calculateBoundingBox(leftBottom), color: patch.color, material: patch.material },   // [0,0.5] × [0,0.5]
        { controlPoints: rightBottom, boundingBox: calculateBoundingBox(rightBottom), color: patch.color, material: patch.material }, // [0.5,1] × [0,0.5]
        { controlPoints: leftTop, boundingBox: calculateBoundingBox(leftTop), color: patch.color, material: patch.material },         // [0,0.5] × [0.5,1]
        { controlPoints: rightTop, boundingBox: calculateBoundingBox(rightTop), color: patch.color, material: patch.material }        // [0.5,1] × [0.5,1]
    ];
};

// Create a simple test Bézier patch
export const createTestBezierPatch = (center: vec3, size: number): BezierPatch => {
    const controlPoints: ControlPointMatrix = [[], [], [], []];
    
    // Create a curved surface instead of a flat plane
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const x = center[0] + (i - 1.5) * size / 3;
            const z = center[2] + (j - 1.5) * size / 3;
            
            // Add curvature - create a saddle shape or wave
            const u = i / 3.0; // Parameter from 0 to 1
            const v = j / 3.0; // Parameter from 0 to 1
            
            // Create a curved surface with some height variation
            const y = center[1] + Math.sin(u * Math.PI) * Math.cos(v * Math.PI) * size * 0.3;
            
            controlPoints[i][j] = [x, y, z];
        }
    }

    // Calculate bounding box
    let min: vec3 = [...controlPoints[0][0]] as vec3;
    let max: vec3 = [...controlPoints[0][0]] as vec3;

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const p = controlPoints[i][j];
            min = [Math.min(min[0], p[0]), Math.min(min[1], p[1]), Math.min(min[2], p[2])];
            max = [Math.max(max[0], p[0]), Math.max(max[1], p[1]), Math.max(max[2], p[2])];
        }
    }

    return {
        controlPoints,
        boundingBox: { min, max },
        color: [0.8, 0.2, 0.2], // 원래 빨간색
        material: MaterialTemplates.MATTE
    };
};

// Convert Hermite-style Bézier patch to standard 4x4 control points
export const hermiteToBezierPatch = (hermite: HermiteBezierPatch): BezierPatch => {
    // Extract corner data
    const { p00, pM0, p0N, pMN } = hermite.positions;
    const { tu00, tuM0, tu0N, tuMN } = hermite.uTangents;
    const { tv00, tvM0, tv0N, tvMN } = hermite.vTangents;
    const { tuv00, tuvM0, tuv0N, tuvMN } = hermite.mixedDerivatives;
    
    // Convert Hermite data to 4x4 Bézier control points using standard formulas
    // This assumes unit parameter domain [0,1] x [0,1]
    const controlPoints: ControlPointMatrix = [[], [], [], []];
    
    // Row 0 (v=0): P(u,0)
    controlPoints[0][0] = [...p00] as vec3;                                    // P(0,0)
    controlPoints[0][1] = add(p00, scale(tu00, 1/3)) as vec3;                 // P(0,0) + tu00/3
    controlPoints[0][2] = subtract(pM0, scale(tuM0, 1/3)) as vec3;            // P(1,0) - tuM0/3
    controlPoints[0][3] = [...pM0] as vec3;                                    // P(1,0)
    
    // Row 1: Intermediate row with v-tangent influence
    const p01 = add(p00, scale(tv00, 1/3)) as vec3;                          // P(0,0) + tv00/3
    const p11 = add(pM0, scale(tvM0, 1/3)) as vec3;                          // P(1,0) + tvM0/3
    
    controlPoints[1][0] = p01;
    controlPoints[1][1] = add(add(p01, scale(tu00, 1/3)), scale(tuv00, 1/9)) as vec3;  // With mixed derivative
    controlPoints[1][2] = add(subtract(p11, scale(tuM0, 1/3)), scale(tuvM0, 1/9)) as vec3;
    controlPoints[1][3] = p11;
    
    // Row 2: Intermediate row approaching (u,1)
    const p02 = subtract(p0N, scale(tv0N, 1/3)) as vec3;                     // P(0,1) - tv0N/3
    const p12 = subtract(pMN, scale(tvMN, 1/3)) as vec3;                     // P(1,1) - tvMN/3
    
    controlPoints[2][0] = p02;
    controlPoints[2][1] = add(add(p02, scale(tu0N, 1/3)), scale(tuv0N, 1/9)) as vec3;
    controlPoints[2][2] = add(subtract(p12, scale(tuMN, 1/3)), scale(tuvMN, 1/9)) as vec3;
    controlPoints[2][3] = p12;
    
    // Row 3 (v=1): P(u,1)
    controlPoints[3][0] = [...p0N] as vec3;                                    // P(0,1)
    controlPoints[3][1] = add(p0N, scale(tu0N, 1/3)) as vec3;                 // P(0,1) + tu0N/3
    controlPoints[3][2] = subtract(pMN, scale(tuMN, 1/3)) as vec3;            // P(1,1) - tuMN/3
    controlPoints[3][3] = [...pMN] as vec3;                                    // P(1,1)
    
    // Calculate bounding box
    let min: vec3 = [...controlPoints[0][0]] as vec3;
    let max: vec3 = [...controlPoints[0][0]] as vec3;

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const p = controlPoints[i][j];
            min = [Math.min(min[0], p[0]), Math.min(min[1], p[1]), Math.min(min[2], p[2])];
            max = [Math.max(max[0], p[0]), Math.max(max[1], p[1]), Math.max(max[2], p[2])];
        }
    }

    return {
        controlPoints,
        boundingBox: { min, max },
        color: hermite.color,
        material: hermite.material
    };
};

// Create a test Hermite Bézier patch with same shape as createTestBezierPatch
export const createTestHermitePatch = (center: vec3, size: number): HermiteBezierPatch => {
    const halfSize = size * 0.5;
    
    // Define 4 corner positions (same as in createTestBezierPatch corners)
    const p00: vec3 = [center[0] - halfSize, center[1] + Math.sin(0) * Math.cos(0) * size * 0.3, center[2] - halfSize];
    const pM0: vec3 = [center[0] + halfSize, center[1] + Math.sin(Math.PI) * Math.cos(0) * size * 0.3, center[2] - halfSize];
    const p0N: vec3 = [center[0] - halfSize, center[1] + Math.sin(0) * Math.cos(Math.PI) * size * 0.3, center[2] + halfSize];
    const pMN: vec3 = [center[0] + halfSize, center[1] + Math.sin(Math.PI) * Math.cos(Math.PI) * size * 0.3, center[2] + halfSize];
    
    // Calculate tangents that will produce the same saddle shape as createTestBezierPatch
    // For the sine-cosine saddle: ∂P/∂u and ∂P/∂v
    const curvature = size * 0.3;
    
    // u-direction tangents: ∂(sin(u*π)*cos(v*π))/∂u = π*cos(u*π)*cos(v*π)
    const tu00: vec3 = [size, curvature * Math.PI * Math.cos(0) * Math.cos(0), 0];           // u=0, v=0
    const tuM0: vec3 = [size, curvature * Math.PI * Math.cos(Math.PI) * Math.cos(0), 0];    // u=1, v=0
    const tu0N: vec3 = [size, curvature * Math.PI * Math.cos(0) * Math.cos(Math.PI), 0];    // u=0, v=1
    const tuMN: vec3 = [size, curvature * Math.PI * Math.cos(Math.PI) * Math.cos(Math.PI), 0]; // u=1, v=1
    
    // v-direction tangents: ∂(sin(u*π)*cos(v*π))/∂v = -π*sin(u*π)*sin(v*π)
    const tv00: vec3 = [0, -curvature * Math.PI * Math.sin(0) * Math.sin(0), size];         // u=0, v=0
    const tvM0: vec3 = [0, -curvature * Math.PI * Math.sin(Math.PI) * Math.sin(0), size];  // u=1, v=0
    const tv0N: vec3 = [0, -curvature * Math.PI * Math.sin(0) * Math.sin(Math.PI), size];  // u=0, v=1
    const tvMN: vec3 = [0, -curvature * Math.PI * Math.sin(Math.PI) * Math.sin(Math.PI), size]; // u=1, v=1
    
    // Mixed derivatives: ∂²(sin(u*π)*cos(v*π))/∂u∂v = -π²*cos(u*π)*sin(v*π)
    const tuv00: vec3 = [0, -curvature * Math.PI * Math.PI * Math.cos(0) * Math.sin(0), 0];        // u=0, v=0
    const tuvM0: vec3 = [0, -curvature * Math.PI * Math.PI * Math.cos(Math.PI) * Math.sin(0), 0];  // u=1, v=0
    const tuv0N: vec3 = [0, -curvature * Math.PI * Math.PI * Math.cos(0) * Math.sin(Math.PI), 0];  // u=0, v=1
    const tuvMN: vec3 = [0, -curvature * Math.PI * Math.PI * Math.cos(Math.PI) * Math.sin(Math.PI), 0]; // u=1, v=1
    
    return {
        corners: {
            p00: { u: 0, v: 0 },
            pM0: { u: 1, v: 0 },
            p0N: { u: 0, v: 1 },
            pMN: { u: 1, v: 1 }
        },
        positions: { p00, pM0, p0N, pMN },
        uTangents: { tu00, tuM0, tu0N, tuMN },
        vTangents: { tv00, tvM0, tv0N, tvMN },
        mixedDerivatives: { tuv00, tuvM0, tuv0N, tuvMN },
        color: [0.2, 0.8, 0.2], // 초록색으로 구분
        material: MaterialTemplates.MATTE
    };
};

// Create Hermite Bézier patch from advanced parameters (like your reference code)
export const createHermitePatchFromAdvancedParams = (
    // Corner parameter values (u,v)
    cornerParams: {
        p00: { u: number; v: number; };
        pM0: { u: number; v: number; };
        p0N: { u: number; v: number; };
        pMN: { u: number; v: number; };
    },
    // Corner positions (XYZ ×4)
    positions: {
        p00: vec3;
        pM0: vec3;
        p0N: vec3;
        pMN: vec3;
    },
    // u-direction tangents (∂P/∂u) at corners (XYZ ×4)
    uTangents: {
        tu00: vec3;
        tuM0: vec3;
        tu0N: vec3;
        tuMN: vec3;
    },
    // v-direction tangents (∂P/∂v) at corners (XYZ ×4)
    vTangents: {
        tv00: vec3;
        tvM0: vec3;
        tv0N: vec3;
        tvMN: vec3;
    },
    // Mixed derivatives (∂²P/∂u∂v) at corners (XYZ ×4)
    mixedDerivatives: {
        tuv00: vec3;
        tuvM0: vec3;
        tuv0N: vec3;
        tuvMN: vec3;
    },
    // Appearance
    color: vec3,
    material: Material
): HermiteBezierPatch => {
    return {
        corners: cornerParams,
        positions,
        uTangents,
        vTangents,
        mixedDerivatives,
        color,
        material
    };
};
