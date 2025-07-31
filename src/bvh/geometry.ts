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
    TORUS = 8
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
        // 실린더의 두 끝점을 고려한 AABB 계산
        const center = cylinder.center;
        const radius = cylinder.radius;
        const height = cylinder.height;
        const halfHeight = height * 0.5;
        
        // 축 방향에 따른 확장 계산 (간단히 모든 방향으로 확장)
        const expansion = Math.max(radius, halfHeight);
        
        const aabb = new AABB(
            [center[0] - expansion, center[1] - expansion, center[2] - expansion],
            [center[0] + expansion, center[1] + expansion, center[2] + expansion]
        );
        
        return {
            type: GeometryType.CYLINDER,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createBoxPrimitive(box: any, index: number): BVHPrimitive {
        const center = box.center;
        const size = box.size;
        const halfSize: vec3 = [size[0] * 0.5, size[1] * 0.5, size[2] * 0.5];
        
        // 회전을 고려한 보수적 AABB (간단히 대각선 길이로 확장)
        const diagonal = Math.sqrt(halfSize[0] * halfSize[0] + halfSize[1] * halfSize[1] + halfSize[2] * halfSize[2]);
        
        const aabb = new AABB(
            [center[0] - diagonal, center[1] - diagonal, center[2] - diagonal],
            [center[0] + diagonal, center[1] + diagonal, center[2] + diagonal]
        );
        
        return {
            type: GeometryType.BOX,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createPlanePrimitive(plane: any, index: number): BVHPrimitive {
        const center = plane.center;
        const size = plane.size;
        const maxSize = Math.max(size[0], size[1]);
        
        const aabb = new AABB(
            [center[0] - maxSize, center[1] - maxSize, center[2] - maxSize],
            [center[0] + maxSize, center[1] + maxSize, center[2] + maxSize]
        );
        
        return {
            type: GeometryType.PLANE,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createCirclePrimitive(circle: any, index: number): BVHPrimitive {
        const center = circle.center;
        const radius = circle.radius;
        
        const aabb = new AABB(
            [center[0] - radius, center[1] - radius, center[2] - radius],
            [center[0] + radius, center[1] + radius, center[2] + radius]
        );
        
        return {
            type: GeometryType.CIRCLE,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createEllipsePrimitive(ellipse: any, index: number): BVHPrimitive {
        const center = ellipse.center;
        const maxRadius = Math.max(ellipse.radiusA, ellipse.radiusB);
        
        const aabb = new AABB(
            [center[0] - maxRadius, center[1] - maxRadius, center[2] - maxRadius],
            [center[0] + maxRadius, center[1] + maxRadius, center[2] + maxRadius]
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
        const center = cone.center;
        const radius = cone.radius;
        const height = cone.height;
        
        // 보수적 AABB: 원뿔을 감싸는 구
        const boundingRadius = Math.sqrt((height * 0.5) * (height * 0.5) + radius * radius);
        
        const aabb = new AABB(
            [center[0] - boundingRadius, center[1] - boundingRadius, center[2] - boundingRadius],
            [center[0] + boundingRadius, center[1] + boundingRadius, center[2] + boundingRadius]
        );
        
        return {
            type: GeometryType.CONE,
            index,
            aabb,
            center: [...center] as vec3
        };
    }

    static createTorusPrimitive(torus: any, index: number): BVHPrimitive {
        const center = torus.center;
        const majorRadius = torus.majorRadius;
        const minorRadius = torus.minorRadius;
        const boundingRadius = majorRadius + minorRadius;
        
        const aabb = new AABB(
            [center[0] - boundingRadius, center[1] - boundingRadius, center[2] - boundingRadius],
            [center[0] + boundingRadius, center[1] + boundingRadius, center[2] + boundingRadius]
        );
        
        return {
            type: GeometryType.TORUS,
            index,
            aabb,
            center: [...center] as vec3
        };
    }
}
