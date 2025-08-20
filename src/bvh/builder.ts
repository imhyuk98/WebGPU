import { BVHNode } from "./node";
import { AABB } from "./aabb";
import { BVHPrimitive, BVHGeometry } from "./geometry";
import { Scene } from "../renderer";

export interface BVHStats {
    primitiveCount: number;
    nodeCount: number;
    leafCount: number;
    avgLeafSize: number;
    maxLeafSize: number;
    rootBestCost: number;
    rootDirectCost: number;
    improvementRatio: number; // (direct-best)/direct (>=0)
    autoFallback: boolean;
}

export class BVHBuilder {
    private nodes: BVHNode[] = [];
    private primitives: BVHPrimitive[] = [];
    private primitiveIndices: number[] = [];
    private nodesUsed: number = 0;

    constructor() {}

    buildBVH(scene: Scene): { nodes: BVHNode[], primitiveIndices: number[], primitiveInfos: { type: number, index: number }[], stats: BVHStats } {
        this.nodes = [];
        this.primitives = [];
        this.primitiveIndices = [];
        this.nodesUsed = 0;

        // 모든 geometry를 primitive로 변환
        this.collectPrimitives(scene);
        
        // console.log(`BVH: Collected ${this.primitives.length} primitives`);
        
        const primCount = this.primitives.length;
        if (primCount === 0) {
            return { nodes: [], primitiveIndices: [], primitiveInfos: [], stats: {
                primitiveCount: 0, nodeCount: 0, leafCount: 0, avgLeafSize: 0, maxLeafSize: 0,
                rootBestCost: Infinity, rootDirectCost: 0, improvementRatio: 0, autoFallback: false
            }};
        }

        // primitive indices 초기화
        this.primitiveIndices = Array.from({ length: primCount }, (_, i) => i);

        // 최대 노드 수 할당 (2 * primitive 수 - 1)
        const maxNodes = 2 * primCount - 1;
        this.nodes = Array.from({ length: maxNodes }, () => new BVHNode());

        // 루트 노드에 모든 primitive 할당
        const rootNode = this.nodes[0];
        this.nodesUsed = 1;

        // 루트 노드의 AABB 계산
        this.updateNodeBounds(0, 0, primCount);

        // --- Root split quality estimation (for auto fallback) ---
    const SMALL_THRESHOLD = 24; // less aggressive fallback to allow BVH for medium-small scenes
    const IMPROVEMENT_THRESHOLD = 0.02; // require only 2% improvement to keep BVH
        const rootDirectCost = primCount; // brute force cost heuristic
        const rootSplit = this.findBestSplit(0, primCount);
        const rootBestCost = rootSplit.cost; // Infinity means invalid / no split
        const improvementRatio = (rootBestCost === Infinity) ? 0 : Math.max(0, (rootDirectCost - rootBestCost) / rootDirectCost);
        const autoFallback = (primCount < SMALL_THRESHOLD) || (rootBestCost === Infinity) || (improvementRatio < IMPROVEMENT_THRESHOLD);

        if (autoFallback) {
            // Skip building full BVH; return empty nodes (renderer will brute-force when useBVH flag is off)
            const primitiveInfosFallback = this.primitives.map(p => ({ type: p.type, index: p.index }));
            const stats: BVHStats = {
                primitiveCount: primCount,
                nodeCount: 0,
                leafCount: 0,
                avgLeafSize: 0,
                maxLeafSize: 0,
                rootBestCost,
                rootDirectCost,
                improvementRatio,
                autoFallback: true,
            };
            return { nodes: [], primitiveIndices: this.primitiveIndices, primitiveInfos: primitiveInfosFallback, stats };
        }

        // 처음 몇 개 primitive의 위치 확인
        // console.log("First 5 primitives:");
        // for (let i = 0; i < Math.min(5, this.primitives.length); i++) {
        //     const p = this.primitives[i];
        //     console.log(`  ${i}: center=${p.center}, type=${p.type}`);
        // }

        // 재귀적으로 분할
        let leafCount = 0;
        let leafPrimTotal = 0;
        let maxLeaf = 0;
        // Wrap original subdivide to collect stats
        const subdivideWithStats = (nodeIndex: number, first: number, count: number) => {
            const node = this.nodes[nodeIndex];
            // termination mirrored from subdivide logic
            if (count <= 4) {
                node.leftChild = first;
                node.primitiveCount = count;
                leafCount++;
                leafPrimTotal += count;
                if (count > maxLeaf) maxLeaf = count;
                return;
            }
            const bestSplit = this.findBestSplit(first, count);
            const shouldForceSplit = count > 32;
            if (bestSplit.cost === Infinity || (!shouldForceSplit && bestSplit.cost >= count * 0.8)) {
                node.leftChild = first;
                node.primitiveCount = count;
                leafCount++;
                leafPrimTotal += count;
                if (count > maxLeaf) maxLeaf = count;
                return;
            }
            const mid = this.partition(first, count, bestSplit.axis, bestSplit.pos);
            if (mid <= first || mid >= first + count) {
                node.leftChild = first;
                node.primitiveCount = count;
                leafCount++;
                leafPrimTotal += count;
                if (count > maxLeaf) maxLeaf = count;
                return;
            }
            node.leftChild = this.nodesUsed;
            node.primitiveCount = 0;
            const leftChildIndex = this.nodesUsed++;
            const rightChildIndex = this.nodesUsed++;
            if (rightChildIndex >= this.nodes.length) {
                node.leftChild = first;
                node.primitiveCount = count;
                leafCount++;
                leafPrimTotal += count;
                if (count > maxLeaf) maxLeaf = count;
                this.nodesUsed = Math.min(this.nodesUsed, this.nodes.length);
                return;
            }
            this.updateNodeBounds(leftChildIndex, first, mid - first);
            this.updateNodeBounds(rightChildIndex, mid, count - (mid - first));
            subdivideWithStats(leftChildIndex, first, mid - first);
            subdivideWithStats(rightChildIndex, mid, count - (mid - first));
        };

        subdivideWithStats(0, 0, primCount);

        // Primitive 정보 배열 생성
        const primitiveInfos = this.primitives.map(primitive => ({ type: primitive.type, index: primitive.index }));
        const stats: BVHStats = {
            primitiveCount: primCount,
            nodeCount: this.nodesUsed,
            leafCount,
            avgLeafSize: leafCount ? (leafPrimTotal / leafCount) : 0,
            maxLeafSize: maxLeaf,
            rootBestCost,
            rootDirectCost,
            improvementRatio,
            autoFallback: false
        };
        return { nodes: this.nodes.slice(0, this.nodesUsed), primitiveIndices: this.primitiveIndices, primitiveInfos, stats };
    }

    private collectPrimitives(scene: Scene): void {
        // Spheres
        if (scene.spheres) {
            scene.spheres.forEach((sphere, index) => {
                this.primitives.push(BVHGeometry.createSpherePrimitive(sphere, index));
            });
        }

        // Cylinders
        if (scene.cylinders) {
            scene.cylinders.forEach((cylinder, index) => {
                this.primitives.push(BVHGeometry.createCylinderPrimitive(cylinder, index));
            });
        }

        // Boxes
        if (scene.boxes) {
            scene.boxes.forEach((box, index) => {
                this.primitives.push(BVHGeometry.createBoxPrimitive(box, index));
            });
        }

        // Planes
        if (scene.planes) {
            scene.planes.forEach((plane, index) => {
                this.primitives.push(BVHGeometry.createPlanePrimitive(plane, index));
            });
        }

        // Circles
        if (scene.circles) {
            scene.circles.forEach((circle, index) => {
                this.primitives.push(BVHGeometry.createCirclePrimitive(circle, index));
            });
        }

        // Ellipses
        if (scene.ellipses) {
            scene.ellipses.forEach((ellipse, index) => {
                this.primitives.push(BVHGeometry.createEllipsePrimitive(ellipse, index));
            });
        }

        // Lines
        if (scene.lines) {
            scene.lines.forEach((line, index) => {
                this.primitives.push(BVHGeometry.createLinePrimitive(line, index));
            });
        }

        // Cones
        if (scene.cones) {
            scene.cones.forEach((cone, index) => {
                this.primitives.push(BVHGeometry.createConePrimitive(cone, index));
            });
        }

        // Toruses
        if (scene.toruses) {
            scene.toruses.forEach((torus, index) => {
                this.primitives.push(BVHGeometry.createTorusPrimitive(torus, index));
            });
        }

        // Bézier Patches
        if (scene.bezierPatches) {
            scene.bezierPatches.forEach((patch, index) => {
                this.primitives.push(BVHGeometry.createBezierPatchPrimitive(patch, index));
            });
        }
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

        // console.log(`Subdivide node ${nodeIndex}: first=${first}, count=${count}`);

        // 종료 조건: 적은 수의 primitive 또는 분할 불가능
        if (count <= 4) { // 4개 이하면 리프 노드로 만들기
            // console.log(`  Leaf node: ${count} primitives`);
            node.leftChild = first;
            node.primitiveCount = count;
            return;
        }

    // SAH(Surface Area Heuristic)를 사용한 최적 분할점 찾기 (binning)
    const bestSplit = this.findBestSplit(first, count);
        
        // console.log(`  Best split: axis=${bestSplit.axis}, pos=${bestSplit.pos}, cost=${bestSplit.cost}`);
        
        // 큰 노드는 강제로 분할
        const shouldForceSplit = count > 32;

        // 유효한 split 실패(Infinity) 또는 강제분할 아님 + 이득 없음 → leaf
        if (bestSplit.cost === Infinity || (!shouldForceSplit && bestSplit.cost >= count * 0.8)) {
            node.leftChild = first;
            node.primitiveCount = count;
            return;
        }

        // 분할점에 따라 primitive들을 정렬
        const mid = this.partition(first, count, bestSplit.axis, bestSplit.pos);

        // 분할 실패(양쪽 중 하나가 비었거나 변동 없음) → leaf로 전환
        if (mid <= first || mid >= first + count) {
            node.leftChild = first;
            node.primitiveCount = count;
            return;
        }

        // 내부 노드로 설정
        node.leftChild = this.nodesUsed;
        node.primitiveCount = 0;

        // 자식 노드들 생성
        const leftChildIndex = this.nodesUsed++;
        const rightChildIndex = this.nodesUsed++;

        // 노드 배열 초과 방지
        if (rightChildIndex >= this.nodes.length) {
            // 더 이상 공간 없으면 leaf로 롤백
            node.leftChild = first;
            node.primitiveCount = count;
            this.nodesUsed = Math.min(this.nodesUsed, this.nodes.length); // 안전
            return;
        }

        // 자식 노드들의 경계 계산
        this.updateNodeBounds(leftChildIndex, first, mid - first);
        this.updateNodeBounds(rightChildIndex, mid, count - (mid - first));

        // 재귀적으로 분할
        this.subdivide(leftChildIndex, first, mid - first);
        this.subdivide(rightChildIndex, mid, count - (mid - first));
    }

    private findBestSplit(first: number, count: number): { axis: number, pos: number, cost: number } {
        // Binned SAH (16 bins)
        const BIN_COUNT = 16;
        let bestCost = Infinity;
        let bestAxis = 0;
        let bestPos = 0;

        // Precompute overall bounds to normalize centers
        const globalAABB = new AABB();
        for (let i = 0; i < count; i++) {
            const prim = this.primitives[this.primitiveIndices[first + i]];
            globalAABB.growAABB(prim.aabb);
        }
        const extent = [
            globalAABB.max[0] - globalAABB.min[0],
            globalAABB.max[1] - globalAABB.min[1],
            globalAABB.max[2] - globalAABB.min[2]
        ];

        for (let axis = 0; axis < 3; axis++) {
            if (extent[axis] <= 1e-6) continue; // Degenerate extent, skip

            // Bin accumulators
            const binCounts = new Array<number>(BIN_COUNT).fill(0);
            const binAABBs: AABB[] = Array.from({ length: BIN_COUNT }, () => new AABB());

            const invExtent = 1.0 / extent[axis];
            // Fill bins
            for (let i = 0; i < count; i++) {
                const prim = this.primitives[this.primitiveIndices[first + i]];
                let c = prim.center[axis];
                let t = (c - globalAABB.min[axis]) * invExtent; // 0..1
                let b = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(t * BIN_COUNT)));
                binCounts[b]++;
                binAABBs[b].growAABB(prim.aabb);
            }

            // Prefix scan (left) and suffix scan (right)
            const leftCount = new Array<number>(BIN_COUNT).fill(0);
            const rightCount = new Array<number>(BIN_COUNT).fill(0);
            const leftAABB: AABB[] = Array.from({ length: BIN_COUNT }, () => new AABB());
            const rightAABB: AABB[] = Array.from({ length: BIN_COUNT }, () => new AABB());

            let accumCount = 0;
            let accumBox = new AABB();
            for (let i = 0; i < BIN_COUNT; i++) {
                accumCount += binCounts[i];
                leftCount[i] = accumCount;
                accumBox.growAABB(binAABBs[i]);
                // copy into leftAABB[i]
                leftAABB[i].min = [...accumBox.min] as any;
                leftAABB[i].max = [...accumBox.max] as any;
            }
            accumCount = 0;
            accumBox = new AABB();
            for (let i = BIN_COUNT - 1; i >= 0; i--) {
                accumCount += binCounts[i];
                rightCount[i] = accumCount;
                accumBox.growAABB(binAABBs[i]);
                rightAABB[i].min = [...accumBox.min] as any;
                rightAABB[i].max = [...accumBox.max] as any;
            }

            // Evaluate splits between bins (i vs i+1)
            for (let i = 0; i < BIN_COUNT - 1; i++) {
                const lc = leftCount[i];
                const rc = rightCount[i + 1];
                if (lc === 0 || rc === 0) continue;
                const la = leftAABB[i].area();
                const ra = rightAABB[i + 1].area();
                const cost = (lc * la + rc * ra) / Math.max(1e-9, la + ra);
                if (cost < bestCost) {
                    bestCost = cost;
                    bestAxis = axis;
                    // Split position: bin boundary
                    const binStartNorm = (i + 1) / BIN_COUNT;
                    bestPos = globalAABB.min[axis] + binStartNorm * extent[axis];
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
