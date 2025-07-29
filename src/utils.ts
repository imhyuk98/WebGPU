// Vector math utilities for 3D calculations

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
