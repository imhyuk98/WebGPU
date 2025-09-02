import { vec3 } from "../utils";
import { AABB } from "./aabb";

// Geometry 타입 정의
export enum GeometryType {
    SPHERE = 0,
    CYLINDER = 1,
    BOX = 2,
    PLANE = 3,
    CIRCLE = 4,
    ELLIPSE = 5,
    LINE = 6,
    CONE = 7,
    TORUS = 8,
    BEZIER_PATCH = 9
}

// BVH에서 사용할 통합 Primitive 인터페이스
export interface BVHPrimitive {
    type: GeometryType;
    index: number; // 해당 타입 배열에서의 인덱스
    aabb: AABB;
    center: vec3;
}

export class BVHGeometry {
    // Primitive를 생성하는 함수들
    static createSpherePrimitive(sphere: any, index: number): BVHPrimitive {
        const radius = sphere.radius;
        const center = sphere.center;
        const aabb = new AABB(
            [center[0] - radius, center[1] - radius, center[2] - radius],
            [center[0] + radius, center[1] + radius, center[2] + radius]
        );
        
        return {
            type: GeometryType.SPHERE,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createCylinderPrimitive(cylinder: any, index: number): BVHPrimitive {
        const center = cylinder.center as vec3;
        const r = cylinder.radius as number;
        const h = cylinder.height as number;
        const hh = h * 0.5;
    let axis: vec3 = cylinder.axis ? ([cylinder.axis[0], cylinder.axis[1], cylinder.axis[2]] as vec3) : ([0,1,0] as vec3);
        // normalize axis
        const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
        axis = [axis[0]/len, axis[1]/len, axis[2]/len];
        const ax = axis[0], ay = axis[1], az = axis[2];
        // Tight bounding extents per component: |a_j|*hh + r*sqrt(1 - a_j^2)
        const extX = Math.abs(ax)*hh + r*Math.sqrt(Math.max(0,1 - ax*ax));
        const extY = Math.abs(ay)*hh + r*Math.sqrt(Math.max(0,1 - ay*ay));
        const extZ = Math.abs(az)*hh + r*Math.sqrt(Math.max(0,1 - az*az));
        const aabb = new AABB(
            [center[0]-extX, center[1]-extY, center[2]-extZ],
            [center[0]+extX, center[1]+extY, center[2]+extZ]
        );
        
        return {
            type: GeometryType.CYLINDER,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createBoxPrimitive(box: any, index: number): BVHPrimitive {
        const center = box.center as vec3;
        const size = box.size as vec3;
        const hx = size[0]*0.5, hy = size[1]*0.5, hz = size[2]*0.5;
        let aabb: AABB;
        if (box.rotation && Array.isArray(box.rotation) && box.rotation.length === 9) {
            const m = box.rotation as number[]; // row-major 3x3
            const a = new AABB();
            for (const sx of [-1,1]) for (const sy of [-1,1]) for (const sz of [-1,1]) {
                const lx = sx*hx, ly = sy*hy, lz = sz*hz;
                const wx = m[0]*lx + m[1]*ly + m[2]*lz + center[0];
                const wy = m[3]*lx + m[4]*ly + m[5]*lz + center[1];
                const wz = m[6]*lx + m[7]*ly + m[8]*lz + center[2];
                a.grow([wx,wy,wz]);
            }
            aabb = a;
        } else {
            // fallback: diagonal sphere
            const d = Math.sqrt(hx*hx + hy*hy + hz*hz);
            aabb = new AABB(
                [center[0]-d, center[1]-d, center[2]-d],
                [center[0]+d, center[1]+d, center[2]+d]
            );
        }
        
        return {
            type: GeometryType.BOX,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createPlanePrimitive(plane: any, index: number): BVHPrimitive {
        const center = plane.center as vec3;
        const size = plane.size as [number, number]; // [width, height]
        const halfW = size[0] * 0.5;
        const halfH = size[1] * 0.5;
        // Use provided tangent basis if available; else build one from normal
        let n: vec3 = plane.normal ? ([plane.normal[0], plane.normal[1], plane.normal[2]] as vec3) : ([0,1,0] as vec3);
        const nlen = Math.hypot(n[0], n[1], n[2]) || 1;
        n = [n[0]/nlen, n[1]/nlen, n[2]/nlen];
        let xdir: vec3 | undefined = plane.xdir ? ([plane.xdir[0], plane.xdir[1], plane.xdir[2]] as vec3) : undefined;
        let ydir: vec3 | undefined = plane.ydir ? ([plane.ydir[0], plane.ydir[1], plane.ydir[2]] as vec3) : undefined;
        // If tangents missing, construct orthonormal basis
        if (!xdir || !ydir) {
            const seed: vec3 = Math.abs(n[0]) < 0.9 ? [1,0,0] : [0,1,0];
            // xdir = normalize(cross(n, seed))
            const cx = n[1]*seed[2] - n[2]*seed[1];
            const cy = n[2]*seed[0] - n[0]*seed[2];
            const cz = n[0]*seed[1] - n[1]*seed[0];
            const clen = Math.hypot(cx, cy, cz) || 1;
            xdir = [cx/clen, cy/clen, cz/clen];
            // ydir = cross(n, xdir)
            ydir = [
                n[1]*xdir[2] - n[2]*xdir[1],
                n[2]*xdir[0] - n[0]*xdir[2],
                n[0]*xdir[1] - n[1]*xdir[0]
            ];
            // normalize ydir
            const ylen = Math.hypot(ydir[0], ydir[1], ydir[2]) || 1;
            ydir = [ydir[0]/ylen, ydir[1]/ylen, ydir[2]/ylen];
        }
        // Rectangle corners (4) -> build tight AABB
        const aabb = new AABB();
        const corners: vec3[] = [
            [center[0] + halfW*xdir[0] + halfH*ydir[0], center[1] + halfW*xdir[1] + halfH*ydir[1], center[2] + halfW*xdir[2] + halfH*ydir[2]],
            [center[0] - halfW*xdir[0] + halfH*ydir[0], center[1] - halfW*xdir[1] + halfH*ydir[1], center[2] - halfW*xdir[2] + halfH*ydir[2]],
            [center[0] + halfW*xdir[0] - halfH*ydir[0], center[1] + halfW*xdir[1] - halfH*ydir[1], center[2] + halfW*xdir[2] - halfH*ydir[2]],
            [center[0] - halfW*xdir[0] - halfH*ydir[0], center[1] - halfW*xdir[1] - halfH*ydir[1], center[2] - halfW*xdir[2] - halfH*ydir[2]]
        ];
        for (const c of corners) aabb.grow(c);
        
        return {
            type: GeometryType.PLANE,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createCirclePrimitive(circle: any, index: number): BVHPrimitive {
        const center = circle.center as vec3;
        const radius = circle.radius as number;
        let n: vec3 = circle.normal ? ([circle.normal[0], circle.normal[1], circle.normal[2]] as vec3) : ([0,1,0] as vec3);
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        n = [n[0]/len, n[1]/len, n[2]/len];
        // For a disk of radius r in a plane with normal n, half-extent along axis j is r * sqrt(1 - n_j^2)
        const extX = radius * Math.sqrt(Math.max(0, 1 - n[0]*n[0]));
        const extY = radius * Math.sqrt(Math.max(0, 1 - n[1]*n[1]));
        const extZ = radius * Math.sqrt(Math.max(0, 1 - n[2]*n[2]));
        const aabb = new AABB(
            [center[0]-extX, center[1]-extY, center[2]-extZ],
            [center[0]+extX, center[1]+extY, center[2]+extZ]
        );
        
        return {
            type: GeometryType.CIRCLE,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createEllipsePrimitive(ellipse: any, index: number): BVHPrimitive {
        const center = ellipse.center as vec3;
        const a = ellipse.radiusA as number;
        const b = ellipse.radiusB as number;
        let n: vec3 = ellipse.normal ? ([ellipse.normal[0], ellipse.normal[1], ellipse.normal[2]] as vec3) : ([0,1,0] as vec3);
        const nlen = Math.hypot(n[0], n[1], n[2]) || 1;
        n = [n[0]/nlen, n[1]/nlen, n[2]/nlen];
        // Build orthonormal tangent basis u,v
        const seed: vec3 = Math.abs(n[0]) < 0.9 ? [1,0,0] : [0,1,0];
        let ux = n[1]*seed[2] - n[2]*seed[1];
        let uy = n[2]*seed[0] - n[0]*seed[2];
        let uz = n[0]*seed[1] - n[1]*seed[0];
        const ulen = Math.hypot(ux, uy, uz) || 1;
        ux /= ulen; uy /= ulen; uz /= ulen;
        // v = cross(n,u)
        let vx = n[1]*uz - n[2]*uy;
        let vy = n[2]*ux - n[0]*uz;
        let vz = n[0]*uy - n[1]*ux;
        const vlen = Math.hypot(vx, vy, vz) || 1;
        vx /= vlen; vy /= vlen; vz /= vlen;
        // Apply in-plane rotation around normal if rotation provided (use z component as angle)
        if (ellipse.rotation && Array.isArray(ellipse.rotation)) {
            const rot = ellipse.rotation as number[];
            const angle = rot[2] || 0; // treat Z as in-plane rotation
            if (angle !== 0) {
                const c = Math.cos(angle), s = Math.sin(angle);
                const rux = c*ux + s*vx;
                const ruy = c*uy + s*vy;
                const ruz = c*uz + s*vz;
                const rvx = -s*ux + c*vx;
                const rvy = -s*uy + c*vy;
                const rvz = -s*uz + c*vz;
                ux = rux; uy = ruy; uz = ruz;
                vx = rvx; vy = rvy; vz = rvz;
            }
        }
        // For ellipse point p = a*cos(t)*u + b*sin(t)*v -> component j amplitude = sqrt((a*u_j)^2 + (b*v_j)^2)
        const extX = Math.sqrt((a*ux)*(a*ux) + (b*vx)*(b*vx));
        const extY = Math.sqrt((a*uy)*(a*uy) + (b*vy)*(b*vy));
        const extZ = Math.sqrt((a*uz)*(a*uz) + (b*vz)*(b*vz));
        const aabb = new AABB(
            [center[0]-extX, center[1]-extY, center[2]-extZ],
            [center[0]+extX, center[1]+extY, center[2]+extZ]
        );
        
        return {
            type: GeometryType.ELLIPSE,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createLinePrimitive(line: any, index: number): BVHPrimitive {
        const start = line.start;
        const end = line.end;
        const thickness = line.thickness;
        
        const center: vec3 = [
            (start[0] + end[0]) * 0.5,
            (start[1] + end[1]) * 0.5,
            (start[2] + end[2]) * 0.5
        ];
        
        const aabb = new AABB();
        aabb.grow([start[0] - thickness, start[1] - thickness, start[2] - thickness]);
        aabb.grow([start[0] + thickness, start[1] + thickness, start[2] + thickness]);
        aabb.grow([end[0] - thickness, end[1] - thickness, end[2] - thickness]);
        aabb.grow([end[0] + thickness, end[1] + thickness, end[2] + thickness]);
        
        return {
            type: GeometryType.LINE,
            index,
            aabb,
            center
        };
    }

    static createConePrimitive(cone: any, index: number): BVHPrimitive {
        const center = cone.center as vec3;
        const r = cone.radius as number;
        const h = cone.height as number;
        const hh = h * 0.5;
    let axis: vec3 = cone.axis ? ([cone.axis[0], cone.axis[1], cone.axis[2]] as vec3) : ([0,1,0] as vec3);
        const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
        axis = [axis[0]/len, axis[1]/len, axis[2]/len];
        const ax = axis[0], ay = axis[1], az = axis[2];
        // Similar to cylinder but radius tapers; use max of base/apex lateral extent
        const extX = Math.abs(ax)*hh + r*Math.sqrt(Math.max(0,1 - ax*ax));
        const extY = Math.abs(ay)*hh + r*Math.sqrt(Math.max(0,1 - ay*ay));
        const extZ = Math.abs(az)*hh + r*Math.sqrt(Math.max(0,1 - az*az));
        const aabb = new AABB(
            [center[0]-extX, center[1]-extY, center[2]-extZ],
            [center[0]+extX, center[1]+extY, center[2]+extZ]
        );
        
        return {
            type: GeometryType.CONE,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createTorusPrimitive(torus: any, index: number): BVHPrimitive {
        const center = torus.center as vec3;
        const R = torus.majorRadius as number;
        const r = torus.minorRadius as number;
        // axis may not be provided; derive from xdir, ydir if present
        let axis: vec3 = torus.axis ? ([torus.axis[0], torus.axis[1], torus.axis[2]] as vec3)
            : (torus.xdir && torus.ydir ? ([
                torus.xdir[1]*torus.ydir[2]-torus.xdir[2]*torus.ydir[1],
                torus.xdir[2]*torus.ydir[0]-torus.xdir[0]*torus.ydir[2],
                torus.xdir[0]*torus.ydir[1]-torus.xdir[1]*torus.ydir[0]
            ] as vec3) : ([0,1,0] as vec3));
        const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
        axis = [axis[0]/len, axis[1]/len, axis[2]/len];
        const ax = axis[0], ay = axis[1], az = axis[2];
        // Component extents: out-of-plane uses r*|a_j|, in-plane uses (R+r)*sqrt(1 - a_j^2)
        const extX = r*Math.abs(ax) + (R + r)*Math.sqrt(Math.max(0,1 - ax*ax));
        const extY = r*Math.abs(ay) + (R + r)*Math.sqrt(Math.max(0,1 - ay*ay));
        const extZ = r*Math.abs(az) + (R + r)*Math.sqrt(Math.max(0,1 - az*az));
        const aabb = new AABB(
            [center[0]-extX, center[1]-extY, center[2]-extZ],
            [center[0]+extX, center[1]+extY, center[2]+extZ]
        );
        
        return {
            type: GeometryType.TORUS,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createBezierPatchPrimitive(patch: any, index: number): BVHPrimitive {
        const boundingBox = patch.boundingBox;
        const center: vec3 = [
            (boundingBox.min[0] + boundingBox.max[0]) * 0.5,
            (boundingBox.min[1] + boundingBox.max[1]) * 0.5,
            (boundingBox.min[2] + boundingBox.max[2]) * 0.5
        ];
        
        const aabb = new AABB(boundingBox.min, boundingBox.max);
        
        return {
            type: GeometryType.BEZIER_PATCH,
            index,
            aabb,
            center
        };
    }
}
