import { vec3 } from "../utils";

export class BVHNode {
    minCorner: vec3 = [0, 0, 0];
    maxCorner: vec3 = [0, 0, 0];
    leftChild: number = 0;
    primitiveCount: number = 0;
    
    constructor() {}
    
    isLeaf(): boolean {
        return this.primitiveCount > 0;
    }
}
