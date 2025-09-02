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

    // Tunable build parameters
    private static readonly MAX_LEAF_SIZE = 8;  // target upper bound of primitives per leaf
    private static readonly MIN_LEAF_SIZE = 4;  // avoid creating children smaller than this when splitting
    private static readonly EPS_IMPROVE = 0.02; // minimal fractional improvement to justify splitting
    private static readonly FORCED_SPLIT_COUNT = 32; // always attempt split above this primitive count

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
        // Only fallback for small scenes
        const autoFallback = (primCount < SMALL_THRESHOLD);

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

        // 통계 래퍼 + 내부 통합 함수
        let leafCount = 0;
        let leafPrimTotal = 0;
        let maxLeaf = 0;
        const MAX_DEPTH = 62;
        // 내부 분할 함수
        const subdivideCore = (nodeIndex: number, first: number, count: number, depth: number = 0, stats?: { leafCount?: number, leafPrimTotal?: number, maxLeaf?: number }) => {
            const node = this.nodes[nodeIndex];
            if (depth > MAX_DEPTH) {
                node.leftChild = first;
                node.primitiveCount = count;
                if (stats) {
                    stats.leafCount!++;
                    stats.leafPrimTotal! += count;
                    if (count > stats.maxLeaf!) stats.maxLeaf! = count;
                }
                return;
            }
            if (count <= BVHBuilder.MAX_LEAF_SIZE) {
                node.leftChild = first;
                node.primitiveCount = count;
                if (stats) {
                    stats.leafCount!++;
                    stats.leafPrimTotal! += count;
                    if (count > stats.maxLeaf!) stats.maxLeaf! = count;
                }
                return;
            }
            const bestSplit = this.findBestSplit(first, count);
            const directCost = 1 + count;
            const shouldForceSplit = count > BVHBuilder.FORCED_SPLIT_COUNT;
            if (bestSplit.cost === Infinity) {
                if (count > BVHBuilder.MAX_LEAF_SIZE) {
                    // Build centroid AABB
                    const centroidAABB = new AABB();
                    for (let i = 0; i < count; i++) {
                        const prim = this.primitives[this.primitiveIndices[first + i]];
                        centroidAABB.grow(prim.center as any);
                    }
                    const ext = [
                        centroidAABB.max[0] - centroidAABB.min[0],
                        centroidAABB.max[1] - centroidAABB.min[1],
                        centroidAABB.max[2] - centroidAABB.min[2]
                    ];
                    let axis = 0;
                    if (ext[1] > ext[axis]) axis = 1;
                    if (ext[2] > ext[axis]) axis = 2;
                    // Median sort with comparator jitter only
                    const slice = this.primitiveIndices.slice(first, first + count);
                    slice.sort((a, b) => {
                        const jitterA = ((a*16807) & 0xffff) / 0xffff * 1e-6;
                        const jitterB = ((b*16807) & 0xffff) / 0xffff * 1e-6;
                        return (this.primitives[a].center[axis] + jitterA) - (this.primitives[b].center[axis] + jitterB);
                    });
                    for (let i = 0; i < count; i++) this.primitiveIndices[first + i] = slice[i];
                    const mid = first + (count >> 1);
                    const leftCount = mid - first;
                    const rightCount = count - leftCount;
                    node.leftChild = this.nodesUsed;
                    node.primitiveCount = 0;
                    const leftChildIndex = this.nodesUsed++;
                    const rightChildIndex = this.nodesUsed++;
                    if (rightChildIndex >= this.nodes.length) {
                        node.leftChild = first;
                        node.primitiveCount = count;
                        if (stats) {
                            stats.leafCount!++;
                            stats.leafPrimTotal! += count;
                            if (count > stats.maxLeaf!) stats.maxLeaf! = count;
                        }
                        this.nodesUsed = Math.min(this.nodesUsed, this.nodes.length);
                        return;
                    }
                    this.updateNodeBounds(leftChildIndex, first, leftCount);
                    this.updateNodeBounds(rightChildIndex, mid, rightCount);
                    subdivideCore(leftChildIndex, first, leftCount, depth+1, stats);
                    subdivideCore(rightChildIndex, mid, rightCount, depth+1, stats);
                    return;
                } else {
                    node.leftChild = first;
                    node.primitiveCount = count;
                    if (stats) {
                        stats.leafCount!++;
                        stats.leafPrimTotal! += count;
                        if (count > stats.maxLeaf!) stats.maxLeaf! = count;
                    }
                    return;
                }
            }
            if (bestSplit.cost === Infinity || (!shouldForceSplit && bestSplit.cost >= directCost * (1 - BVHBuilder.EPS_IMPROVE))) {
                node.leftChild = first;
                node.primitiveCount = count;
                if (stats) {
                    stats.leafCount!++;
                    stats.leafPrimTotal! += count;
                    if (count > stats.maxLeaf!) stats.maxLeaf! = count;
                }
                return;
            }
            let mid = this.partition(first, count, bestSplit.axis, bestSplit.pos);
            let leftCount = mid - first;
            let rightCount = count - leftCount;
            if ((leftCount < BVHBuilder.MIN_LEAF_SIZE || rightCount < BVHBuilder.MIN_LEAF_SIZE) && count > BVHBuilder.MAX_LEAF_SIZE) {
                const slice = this.primitiveIndices.slice(first, first + count);
                slice.sort((a, b) => {
                    const jitterA = ((a*16807) & 0xffff) / 0xffff * 1e-6;
                    const jitterB = ((b*16807) & 0xffff) / 0xffff * 1e-6;
                    return (this.primitives[a].center[bestSplit.axis] + jitterA) - (this.primitives[b].center[bestSplit.axis] + jitterB);
                });
                for (let i = 0; i < count; i++) this.primitiveIndices[first + i] = slice[i];
                mid = first + (count >> 1);
                leftCount = mid - first;
                rightCount = count - leftCount;
            }
            if (mid <= first || mid >= first + count) {
                node.leftChild = first;
                node.primitiveCount = count;
                if (stats) {
                    stats.leafCount!++;
                    stats.leafPrimTotal! += count;
                    if (count > stats.maxLeaf!) stats.maxLeaf! = count;
                }
                return;
            }
            node.leftChild = this.nodesUsed;
            node.primitiveCount = 0;
            const leftChildIndex = this.nodesUsed++;
            const rightChildIndex = this.nodesUsed++;
            if (rightChildIndex >= this.nodes.length) {
                node.leftChild = first;
                node.primitiveCount = count;
                if (stats) {
                    stats.leafCount!++;
                    stats.leafPrimTotal! += count;
                    if (count > stats.maxLeaf!) stats.maxLeaf! = count;
                }
                this.nodesUsed = Math.min(this.nodesUsed, this.nodes.length); return;
            }
            // AABB reuse guard: only use precomputed if counts match
            const canReusePrecomputed = bestSplit.leftCount === leftCount && bestSplit.rightCount === rightCount && bestSplit.leftAABB && bestSplit.rightAABB;
            if (canReusePrecomputed) {
                this.nodes[leftChildIndex].minCorner = [...bestSplit.leftAABB!.min];
                this.nodes[leftChildIndex].maxCorner = [...bestSplit.leftAABB!.max];
                this.nodes[rightChildIndex].minCorner = [...bestSplit.rightAABB!.min];
                this.nodes[rightChildIndex].maxCorner = [...bestSplit.rightAABB!.max];
            } else {
                this.updateNodeBounds(leftChildIndex, first, leftCount);
                this.updateNodeBounds(rightChildIndex, mid, rightCount);
            }
            subdivideCore(leftChildIndex, first, leftCount, depth+1, stats);
            subdivideCore(rightChildIndex, mid, rightCount, depth+1, stats);
        };
        // 통계 래퍼
        const statsObj = { leafCount: 0, leafPrimTotal: 0, maxLeaf: 0 };
        subdivideCore(0, 0, primCount, 0, statsObj);

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

    private subdivide(nodeIndex: number, first: number, count: number, depth: number = 0): void {
        const node = this.nodes[nodeIndex];

        // console.log(`Subdivide node ${nodeIndex}: first=${first}, count=${count}`);

        // 종료 조건: 적은 수의 primitive 또는 분할 불가능
    if (depth > 62) { node.leftChild = first; node.primitiveCount = count; return; }
    if (count <= BVHBuilder.MAX_LEAF_SIZE) { // Leaf threshold
            // console.log(`  Leaf node: ${count} primitives`);
            node.leftChild = first;
            node.primitiveCount = count;
            return;
        }

    // SAH(Surface Area Heuristic)를 사용한 최적 분할점 찾기 (binning)
    const bestSplit = this.findBestSplit(first, count);
        
        // console.log(`  Best split: axis=${bestSplit.axis}, pos=${bestSplit.pos}, cost=${bestSplit.cost}`);
        
        // 큰 노드는 강제로 분할
    const directCost = 1 + count; // Ct + Ci*count
    const shouldForceSplit = count > BVHBuilder.FORCED_SPLIT_COUNT;
    if (bestSplit.cost === Infinity) {
        if (count > BVHBuilder.MAX_LEAF_SIZE) {
            const centroidAABB = new AABB();
            for (let i = 0; i < count; i++) {
                const prim = this.primitives[this.primitiveIndices[first + i]];
                centroidAABB.grow(prim.center as any);
            }
            const ext = [
                centroidAABB.max[0] - centroidAABB.min[0],
                centroidAABB.max[1] - centroidAABB.min[1],
                centroidAABB.max[2] - centroidAABB.min[2]
            ];
            let axis = 0; if (ext[1] > ext[axis]) axis = 1; if (ext[2] > ext[axis]) axis = 2;
            const slice = this.primitiveIndices.slice(first, first + count);
                    slice.sort((a, b) => {
                        const jitterA = ((a*16807) & 0xffff) / 0xffff * 1e-6;
                        const jitterB = ((b*16807) & 0xffff) / 0xffff * 1e-6;
                        return (this.primitives[a].center[axis] + jitterA) - (this.primitives[b].center[axis] + jitterB);
                    });
            for (let i = 0; i < count; i++) this.primitiveIndices[first + i] = slice[i];
            const mid = first + (count >> 1);
            const leftCount = mid - first; const rightCount = count - leftCount;
            node.leftChild = this.nodesUsed; node.primitiveCount = 0;
            const leftChildIndex = this.nodesUsed++; const rightChildIndex = this.nodesUsed++;
            if (rightChildIndex >= this.nodes.length) { node.leftChild = first; node.primitiveCount = count; this.nodesUsed = Math.min(this.nodesUsed, this.nodes.length); return; }
            this.updateNodeBounds(leftChildIndex, first, leftCount);
            this.updateNodeBounds(rightChildIndex, mid, rightCount);
            this.subdivide(leftChildIndex, first, leftCount, depth+1);
            this.subdivide(rightChildIndex, mid, rightCount, depth+1);
            return;
        } else {
            node.leftChild = first; node.primitiveCount = count; return;
        }
    }
    if (bestSplit.cost === Infinity || (!shouldForceSplit && bestSplit.cost >= directCost * (1 - BVHBuilder.EPS_IMPROVE))) {
            node.leftChild = first;
            node.primitiveCount = count;
            return;
        }

        // 분할점에 따라 primitive들을 정렬
        let mid = this.partition(first, count, bestSplit.axis, bestSplit.pos);
        let leftCount = mid - first;
        let rightCount = count - leftCount;
        if ((leftCount < BVHBuilder.MIN_LEAF_SIZE || rightCount < BVHBuilder.MIN_LEAF_SIZE) && count > BVHBuilder.MAX_LEAF_SIZE) {
            const slice = this.primitiveIndices.slice(first, first + count);
                slice.sort((a, b) => {
                    const jitterA = ((a*16807) & 0xffff) / 0xffff * 1e-6;
                    const jitterB = ((b*16807) & 0xffff) / 0xffff * 1e-6;
                    return (this.primitives[a].center[bestSplit.axis] + jitterA) - (this.primitives[b].center[bestSplit.axis] + jitterB);
                });
            for (let i = 0; i < count; i++) this.primitiveIndices[first + i] = slice[i];
            mid = first + (count >> 1);
            leftCount = mid - first;
            rightCount = count - leftCount;
        }
        if (mid <= first || mid >= first + count) {
            node.leftChild = first;
            node.primitiveCount = count;
            return;
        }
        node.leftChild = this.nodesUsed;
        node.primitiveCount = 0;
        const leftChildIndex = this.nodesUsed++;
        const rightChildIndex = this.nodesUsed++;
        if (rightChildIndex >= this.nodes.length) {
            node.leftChild = first;
            node.primitiveCount = count;
            this.nodesUsed = Math.min(this.nodesUsed, this.nodes.length); return;
        }
        if (bestSplit.leftAABB && bestSplit.rightAABB) {
            this.nodes[leftChildIndex].minCorner = [...bestSplit.leftAABB.min];
            this.nodes[leftChildIndex].maxCorner = [...bestSplit.leftAABB.max];
            this.nodes[rightChildIndex].minCorner = [...bestSplit.rightAABB.min];
            this.nodes[rightChildIndex].maxCorner = [...bestSplit.rightAABB.max];
        } else {
            this.updateNodeBounds(leftChildIndex, first, leftCount);
            this.updateNodeBounds(rightChildIndex, mid, rightCount);
        }
        this.subdivide(leftChildIndex, first, leftCount, depth+1);
        this.subdivide(rightChildIndex, mid, rightCount, depth+1);
    }

    private findBestSplit(first: number, count: number): { axis: number, pos: number, cost: number, leftAABB?: AABB, rightAABB?: AABB, leftCount?: number, rightCount?: number } {
        // Adaptive bin count
        let BIN_COUNT = 16;
        if (count > 4096) BIN_COUNT = 32;
        else if (count > 512) BIN_COUNT = 24;
        else if (count > 128) BIN_COUNT = 16;
        else BIN_COUNT = 12;
        let bestCost = Infinity;
        let bestAxis = 0;
        let bestPos = 0;
        let bestLeftAABB: AABB | undefined = undefined;
        let bestRightAABB: AABB | undefined = undefined;
        let bestLeftCount: number | undefined = undefined;
        let bestRightCount: number | undefined = undefined;

        // Parent bounds & area
        const parentAABB = new AABB();
        for (let i = 0; i < count; i++) {
            const prim = this.primitives[this.primitiveIndices[first + i]];
            parentAABB.growAABB(prim.aabb);
        }
        const parentArea = Math.max(1e-12, parentAABB.area());

        // Centroid bounds
        const centroidAABB = new AABB();
        for (let i = 0; i < count; i++) {
            const prim = this.primitives[this.primitiveIndices[first + i]];
            centroidAABB.grow(prim.center as any);
        }
        const centroidExtent = [
            centroidAABB.max[0] - centroidAABB.min[0],
            centroidAABB.max[1] - centroidAABB.min[1],
            centroidAABB.max[2] - centroidAABB.min[2]
        ];

    for (let axis = 0; axis < 3; axis++) {
            const extent = centroidExtent[axis];
            if (extent <= 1e-6) continue;
            const invExtent = 1.0 / extent;
            const binCounts = new Array<number>(BIN_COUNT).fill(0);
            const binAABBs: AABB[] = Array.from({ length: BIN_COUNT }, () => new AABB());

            // Fill bins
            for (let i = 0; i < count; i++) {
                const prim = this.primitives[this.primitiveIndices[first + i]];
                const t = (prim.center[axis] - centroidAABB.min[axis]) * invExtent;
                const b = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(t * BIN_COUNT)));
                binCounts[b]++;
                binAABBs[b].growAABB(prim.aabb);
            }

            // Prefix/suffix scans
            const leftCount = new Array<number>(BIN_COUNT).fill(0);
            const rightCount = new Array<number>(BIN_COUNT).fill(0);
            const leftAABB: AABB[] = Array.from({ length: BIN_COUNT }, () => new AABB());
            const rightAABB: AABB[] = Array.from({ length: BIN_COUNT }, () => new AABB());
            let accC = 0; let accBox = new AABB();
            for (let i = 0; i < BIN_COUNT; i++) {
                accC += binCounts[i];
                leftCount[i] = accC;
                accBox.growAABB(binAABBs[i]);
                leftAABB[i].min = [...accBox.min] as any;
                leftAABB[i].max = [...accBox.max] as any;
            }
            accC = 0; accBox = new AABB();
            for (let i = BIN_COUNT - 1; i >= 0; i--) {
                accC += binCounts[i];
                rightCount[i] = accC;
                accBox.growAABB(binAABBs[i]);
                rightAABB[i].min = [...accBox.min] as any;
                rightAABB[i].max = [...accBox.max] as any;
            }

            // Evaluate SAH splits
            for (let i = 0; i < BIN_COUNT - 1; i++) {
                const lc = leftCount[i];
                const rc = rightCount[i + 1];
                if (lc < BVHBuilder.MIN_LEAF_SIZE || rc < BVHBuilder.MIN_LEAF_SIZE) continue;
                const la = leftAABB[i].area();
                const ra = rightAABB[i + 1].area();
                const sahCost = 1 + (lc * la + rc * ra) / parentArea; // Ct=1, Ci=1
                if (sahCost < bestCost) {
                    bestCost = sahCost;
                    bestAxis = axis;
                    const boundary = (i + 1) / BIN_COUNT;
                    bestPos = centroidAABB.min[axis] + boundary * extent;
                    bestLeftAABB = leftAABB[i].clone();
                    bestRightAABB = rightAABB[i + 1].clone();
                    bestLeftCount = lc;
                    bestRightCount = rc;
                }
            }
        }
    return { axis: bestAxis, pos: bestPos, cost: bestCost, leftAABB: bestLeftAABB, rightAABB: bestRightAABB, leftCount: bestLeftCount, rightCount: bestRightCount };
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
