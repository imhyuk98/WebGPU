import { BVHNode } from "./node";
import { AABB } from "./aabb";
import { BVHPrimitive, BVHGeometry } from "./geometry";
import { Scene } from "../renderer";

export class BVHBuilder {
    private nodes: BVHNode[] = [];
    private primitives: BVHPrimitive[] = [];
    private primitiveIndices: number[] = [];
    private nodesUsed: number = 0;

    constructor() {}

    buildBVH(scene: Scene): { nodes: BVHNode[], primitiveIndices: number[] } {
        this.nodes = [];
        this.primitives = [];
        this.primitiveIndices = [];
        this.nodesUsed = 0;

        // 모든 geometry를 primitive로 변환
        this.collectPrimitives(scene);
        
        console.log(`BVH: Collected ${this.primitives.length} primitives`);
        
        if (this.primitives.length === 0) {
            return { nodes: [], primitiveIndices: [] };
        }

        // primitive indices 초기화
        this.primitiveIndices = Array.from({ length: this.primitives.length }, (_, i) => i);

        // 최대 노드 수 할당 (2 * primitive 수 - 1)
        const maxNodes = 2 * this.primitives.length - 1;
        this.nodes = Array.from({ length: maxNodes }, () => new BVHNode());

        // 루트 노드에 모든 primitive 할당
        const rootNode = this.nodes[0];
        this.nodesUsed = 1;

        // 루트 노드의 AABB 계산
        this.updateNodeBounds(0, 0, this.primitives.length);

        // 처음 몇 개 primitive의 위치 확인
        console.log("First 5 primitives:");
        for (let i = 0; i < Math.min(5, this.primitives.length); i++) {
            const p = this.primitives[i];
            console.log(`  ${i}: center=${p.center}, type=${p.type}`);
        }

        // 재귀적으로 분할
        this.subdivide(0, 0, this.primitives.length);

        return { 
            nodes: this.nodes.slice(0, this.nodesUsed), 
            primitiveIndices: this.primitiveIndices 
        };
    }

    private collectPrimitives(scene: Scene): void {
        // Spheres
        scene.spheres.forEach((sphere, index) => {
            this.primitives.push(BVHGeometry.createSpherePrimitive(sphere, index));
        });

        // Cylinders
        scene.cylinders.forEach((cylinder, index) => {
            this.primitives.push(BVHGeometry.createCylinderPrimitive(cylinder, index));
        });

        // Boxes
        scene.boxes.forEach((box, index) => {
            this.primitives.push(BVHGeometry.createBoxPrimitive(box, index));
        });

        // Planes
        scene.planes.forEach((plane, index) => {
            this.primitives.push(BVHGeometry.createPlanePrimitive(plane, index));
        });

        // Circles
        scene.circles.forEach((circle, index) => {
            this.primitives.push(BVHGeometry.createCirclePrimitive(circle, index));
        });

        // Ellipses
        scene.ellipses.forEach((ellipse, index) => {
            this.primitives.push(BVHGeometry.createEllipsePrimitive(ellipse, index));
        });

        // Lines
        scene.lines.forEach((line, index) => {
            this.primitives.push(BVHGeometry.createLinePrimitive(line, index));
        });

        // Cones
        scene.cones.forEach((cone, index) => {
            this.primitives.push(BVHGeometry.createConePrimitive(cone, index));
        });

        // Toruses
        scene.toruses.forEach((torus, index) => {
            this.primitives.push(BVHGeometry.createTorusPrimitive(torus, index));
        });
    }

    private updateNodeBounds(nodeIndex: number, first: number, count: number): void {
        const node = this.nodes[nodeIndex];
        const aabb = new AABB();

        for (let i = 0; i < count; i++) {
            const primitiveIndex = this.primitiveIndices[first + i];
            const primitive = this.primitives[primitiveIndex];
            aabb.growAABB(primitive.aabb);
        }

        node.minCorner = aabb.min;
        node.maxCorner = aabb.max;
    }

    private subdivide(nodeIndex: number, first: number, count: number): void {
        const node = this.nodes[nodeIndex];

        console.log(`Subdivide node ${nodeIndex}: first=${first}, count=${count}`);

        // 종료 조건: 적은 수의 primitive 또는 분할 불가능
        if (count <= 4) { // 4개 이하면 리프 노드로 만들기
            console.log(`  Leaf node: ${count} primitives`);
            node.leftChild = first;
            node.primitiveCount = count;
            return;
        }

        // SAH(Surface Area Heuristic)를 사용한 최적 분할점 찾기
        const bestSplit = this.findBestSplit(first, count);
        
        console.log(`  Best split: axis=${bestSplit.axis}, pos=${bestSplit.pos}, cost=${bestSplit.cost}`);
        
        // 큰 노드는 강제로 분할
        const shouldForceSplit = count > 32;
        
        if (!shouldForceSplit && bestSplit.cost >= count * 0.8) {
            // 분할하는 것보다 그냥 두는 게 나은 경우
            console.log(`  No split benefit, making leaf with ${count} primitives`);
            node.leftChild = first;
            node.primitiveCount = count;
            return;
        }
        
        if (shouldForceSplit) {
            console.log(`  Force splitting large node with ${count} primitives`);
        }

        // 분할점에 따라 primitive들을 정렬
        const mid = this.partition(first, count, bestSplit.axis, bestSplit.pos);

        // 내부 노드로 설정
        node.leftChild = this.nodesUsed;
        node.primitiveCount = 0;

        // 자식 노드들 생성
        const leftChildIndex = this.nodesUsed++;
        const rightChildIndex = this.nodesUsed++;

        // 자식 노드들의 경계 계산
        this.updateNodeBounds(leftChildIndex, first, mid - first);
        this.updateNodeBounds(rightChildIndex, mid, count - (mid - first));

        // 재귀적으로 분할
        this.subdivide(leftChildIndex, first, mid - first);
        this.subdivide(rightChildIndex, mid, count - (mid - first));
    }

    private findBestSplit(first: number, count: number): { axis: number, pos: number, cost: number } {
        let bestCost = Infinity;
        let bestAxis = 0;
        let bestPos = 0;

        // 각 축에 대해 검사
        for (let axis = 0; axis < 3; axis++) {
            // 후보 분할점들을 primitive 중심점으로 설정
            const candidates: number[] = [];
            for (let i = 0; i < count; i++) {
                const primitiveIndex = this.primitiveIndices[first + i];
                const primitive = this.primitives[primitiveIndex];
                candidates.push(primitive.center[axis]);
            }

            // 중복 제거 및 정렬
            const uniqueCandidates = [...new Set(candidates)].sort((a, b) => a - b);

            // 각 후보점에 대해 비용 계산
            for (const pos of uniqueCandidates) {
                let leftCount = 0;
                let rightCount = 0;
                const leftAABB = new AABB();
                const rightAABB = new AABB();

                for (let i = 0; i < count; i++) {
                    const primitiveIndex = this.primitiveIndices[first + i];
                    const primitive = this.primitives[primitiveIndex];

                    if (primitive.center[axis] < pos) {
                        leftCount++;
                        leftAABB.growAABB(primitive.aabb);
                    } else {
                        rightCount++;
                        rightAABB.growAABB(primitive.aabb);
                    }
                }

                // 한쪽이 비어있으면 건너뛰기
                if (leftCount === 0 || rightCount === 0) continue;

                // SAH 비용 계산 (정규화된 버전)
                const leftArea = leftAABB.area();
                const rightArea = rightAABB.area();
                const totalArea = leftArea + rightArea;
                
                // 비용을 primitive 수로 정규화
                const cost = totalArea > 0 ? 
                    (leftCount * leftArea + rightCount * rightArea) / totalArea : 
                    leftCount + rightCount;

                if (cost < bestCost) {
                    bestCost = cost;
                    bestAxis = axis;
                    bestPos = pos;
                }
            }
        }

        return { axis: bestAxis, pos: bestPos, cost: bestCost };
    }

    private partition(first: number, count: number, axis: number, pos: number): number {
        let i = first;
        let j = first + count - 1;

        while (i <= j) {
            const leftPrimitiveIndex = this.primitiveIndices[i];
            const leftPrimitive = this.primitives[leftPrimitiveIndex];

            if (leftPrimitive.center[axis] < pos) {
                i++;
            } else {
                // swap
                const temp = this.primitiveIndices[i];
                this.primitiveIndices[i] = this.primitiveIndices[j];
                this.primitiveIndices[j] = temp;
                j--;
            }
        }

        return i;
    }
}
