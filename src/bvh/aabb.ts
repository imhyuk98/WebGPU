import { vec3 } from "../utils";

export class AABB {
    min: vec3 = [1e30, 1e30, 1e30]; 
    max: vec3 = [-1e30, -1e30, -1e30]; 

    constructor(min?: vec3, max?: vec3) {
        if (min && max) {
            this.min = [...min] as vec3;
            this.max = [...max] as vec3;
        }
    }

    grow(point: vec3): void {
        this.min[0] = Math.min(this.min[0], point[0]);
        this.min[1] = Math.min(this.min[1], point[1]);
        this.min[2] = Math.min(this.min[2], point[2]);
        
        this.max[0] = Math.max(this.max[0], point[0]);
        this.max[1] = Math.max(this.max[1], point[1]);
        this.max[2] = Math.max(this.max[2], point[2]);
    }

    growAABB(other: AABB): void {
        this.grow(other.min);
        this.grow(other.max);
    }

    area(): number {
        const extent: vec3 = [
            this.max[0] - this.min[0],
            this.max[1] - this.min[1],
            this.max[2] - this.min[2]
        ];
        return extent[0] * extent[1] + extent[1] * extent[2] + extent[0] * extent[2];
    }

    center(): vec3 {
        return [
            (this.min[0] + this.max[0]) * 0.5,
            (this.min[1] + this.max[1]) * 0.5,
            (this.min[2] + this.max[2]) * 0.5
        ];
    }

    valid(): boolean {
        return this.min[0] <= this.max[0] && 
               this.min[1] <= this.max[1] && 
               this.min[2] <= this.max[2];
    }
}
