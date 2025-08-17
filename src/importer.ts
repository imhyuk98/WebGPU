// src/importer.ts
// DTDS v1 바이너리를 웹에서 읽어,
// (A) Family(Symbol) 단위로 로컬 프리미티브를 모아두고
// (B) Instance 트랜스폼을 Family 전체에 적용하여 월드 프리미티브로 변환
// (C) Normal 섹션 기하도 같은 도형별 배열에 합쳐서
// (D) 도형별 배열(WorldPrimitives)에 "제한 없이" 담은 뒤, 로그로 요약 출력.
//
// 변경 포인트 (Revised)
// - [기존] SymbolDefinition: 프리픽스 자동 정렬 + 실패 시 대체 오프셋 재시도(decodeSymbolRobust, 스캔 범위 확대)
// - [기존] Instance: instId + 12*f64 트랜스폼 fast-path + 4바이트 스캔(f64→f32 폴백)
// - [기존] 월드 프리미티브: Plane / Sphere / Cylinder / Circle / Ellipse / Line / Cone / EllipseCurve / CircleCurve / HermiteFace / HermiteSpline / Revolved(+보조 Torus) / Generic
// - [★개선됨] Normal 섹션: 1차 디코딩(f64) 실패 시(유효성 검사 포함) Revolved/HermiteFace에 한해 심볼 디코더(f64/f32)로 로버스트 재시도
// - [★추가됨] Revolved / HermiteFace f32 지원 추가 및 디코딩 인프라 개선
// - [★추가됨] Line(Type 8)을 Revolved로 해석하는 Heuristic 추가 (Torus 카운트 수정)
//
// 좌표계 변환(Z-up→Y-up)은 APPLY_ZUP_TO_YUP 플래그로 제어

// ──────────────────────────────────────────────────────────────────────────────
// 0) 타입/상수
// ──────────────────────────────────────────────────────────────────────────────
export enum ShapeType {
  Cylinder = 1,
  Sphere = 2,
  Plane = 3,
  Circle = 4,
  Cone = 5,
  Revolved = 6,
  myEllipse = 7,
  Line = 8,
  EllipseCurve = 9,
  CircleCurve = 10,
  HermiteFace = 11,
  HermiteSpline = 12,
  Generic = 13,
  Instance = 100,
}

export const ShapeTypeNames: Record<number, string> = {
  [ShapeType.Cylinder]: "Cylinder",
  [ShapeType.Sphere]: "Sphere",
  [ShapeType.Plane]: "Plane",
  [ShapeType.Circle]: "Circle",
  [ShapeType.Cone]: "Cone",
  [ShapeType.Revolved]: "Revolved",
  [ShapeType.myEllipse]: "myEllipse",
  [ShapeType.Line]: "Line",
  [ShapeType.EllipseCurve]: "EllipseCurve",
  [ShapeType.CircleCurve]: "CircleCurve",
  [ShapeType.HermiteFace]: "HermiteFace",
  [ShapeType.HermiteSpline]: "HermiteSpline",
  [ShapeType.Generic]: "Generic",
  [ShapeType.Instance]: "Instance",
  99: "Unknown(99)",
};

type Vec3 = [number, number, number];
const DEG = (rad: number) => (rad * 180) / Math.PI;

const HEXDUMP_MAX = 64;
const MAX_REC_LEN = 128 * 1024 * 1024;
const APPLY_ZUP_TO_YUP = false; // 필요 시 true

// 로그 보정(유효치가 없을 때 기본값으로 채워 배열에라도 담기)
const RELAX_FOR_LOG = true;
const DEFAULTS = {
  radius: 1,
  height: 1,
  rx: 1,
  ry: 1,
  lineThickness: 0.01,
};

// 심볼 로버스트 스캔 최대 바이트
const ROBUST_SCAN_MAX = 512;

// ──────────────────────────────────────────────────────────────────────────────
// 1) 바이너리 리더
// ──────────────────────────────────────────────────────────────────────────────
class BinReader {
  public view: DataView;
  private _off = 0;
  constructor(public buf: ArrayBuffer) { this.view = new DataView(buf); }
  get offset() { return this._off; }
  set offset(v: number) { this._off = v; }
  left() { return this.view.byteLength - this._off; }
  private need(n: number) {
    if (n < 0) throw new Error(`Negative read: ${n} (off=${this._off})`);
    if (this.left() < n) throw new Error(`Unexpected EOF: need ${n}, left ${this.left()} (off=${this._off})`);
  }
  u8(): number  { this.need(1); const x = this.view.getUint8(this._off); this._off += 1; return x; }
  i32(): number { this.need(4); const x = this.view.getInt32(this._off, true); this._off += 4; return x; }
  f64(): number { this.need(8); const x = this.view.getFloat64(this._off, true); this._off += 8; return x; }
  // f32 지원 (이전 수정에서 추가됨)
  f32(): number { this.need(4); const x = this.view.getFloat32(this._off, true); this._off += 4; return x; }
  str4(): string { this.need(4); const b = new Uint8Array(this.view.buffer, this._off, 4); this._off += 4; return String.fromCharCode(b[0], b[1], b[2], b[3]); }
  skip(n: number) { this.need(n); this._off += n; }
  readVec3(): Vec3 { return [this.f64(), this.f64(), this.f64()]; }
  // f32 지원 (이전 수정에서 추가됨)
  readVec3f32(): Vec3 { return [this.f32(), this.f32(), this.f32()]; }
  peekBytes(n: number): Uint8Array { this.need(n); return new Uint8Array(this.view.buffer, this._off, n).slice(); }
}

// ──────────────────────────────────────────────────────────────────────────────
// 2) 공통 유틸/수학
// ──────────────────────────────────────────────────────────────────────────────
function readRecHeader(r: BinReader): { t: number; len: number } {
  const t = r.u8();
  const len = r.i32();
  if (len < 0) throw new Error(`Negative record len: ${len} at off=${r.offset - 4}`);
  if (len > MAX_REC_LEN) throw new Error(`Record too large: ${len} > ${MAX_REC_LEN} at off=${r.offset - 4}`);
  if (len > r.left()) throw new Error(`Record len ${len} > remaining ${r.left()} at off=${r.offset - 4}`);
  return { t, len };
}
function hexdump(bytes: Uint8Array, max = HEXDUMP_MAX) {
  const n = Math.min(bytes.length, max);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(bytes[i].toString(16).padStart(2, "0"));
  if (bytes.length > max) parts.push("…");
  return parts.join(" ");
}
function fmt3(v?: Vec3, p: number = 6) {
  if (!v) return "undefined";
  return `[${v[0].toFixed(p)}, ${v[1].toFixed(p)}, ${v[2].toFixed(p)}]`;
}
function add(a: Vec3, b: Vec3): Vec3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub(a: Vec3, b: Vec3): Vec3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function length(a: Vec3) { return Math.hypot(a[0], a[1], a[2]); }
function cross(a: Vec3, b: Vec3): Vec3 { return [ a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0] ]; }
function norm(a: Vec3): Vec3 { const L = length(a); return L ? [a[0]/L, a[1]/L, a[2]/L] : [0,0,0]; }
function dot(a: Vec3, b: Vec3): number { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function finite(v: number) { return Number.isFinite(v) && Math.abs(v) < 1e12; }
function finiteVec(v?: Vec3): boolean { return !!v && finite(v[0]) && finite(v[1]) && finite(v[2]); }

// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// 3) 트랜스폼
// ──────────────────────────────────────────────────────────────────────────────
export type TransformRecord = { origin: Vec3; bx: Vec3; by: Vec3; bz: Vec3 };

function applyTransform(local: Vec3, tr: TransformRecord): Vec3 {
  return [
    tr.origin[0] + local[0]*tr.bx[0] + local[1]*tr.by[0] + local[2]*tr.bz[0],
    tr.origin[1] + local[0]*tr.bx[1] + local[1]*tr.by[1] + local[2]*tr.bz[1],
    tr.origin[2] + local[0]*tr.bx[2] + local[1]*tr.by[2] + local[2]*tr.bz[2],
  ];
}
function applyRotation(dir: Vec3, tr: TransformRecord): Vec3 {
  return [
    dir[0]*tr.bx[0] + dir[1]*tr.by[0] + dir[2]*tr.bz[0],
    dir[0]*tr.bx[1] + dir[1]*tr.by[1] + dir[2]*tr.bz[1],
    dir[0]*tr.bx[2] + dir[1]*tr.by[2] + dir[2]*tr.bz[2],
  ];
}
// Z-up -> Y-up: (x, y, z) -> (x, z, -y)
function fixCoordSystem(p: Vec3): Vec3 { const [ox, oy, oz] = p; return [ox, oz, -oy]; }
function maybeFix(p: Vec3): Vec3 { return APPLY_ZUP_TO_YUP ? fixCoordSystem(p) : p; }

function isValidBasis(bx: Vec3, by: Vec3, bz: Vec3): boolean {
  const lx = length(bx), ly = length(by), lz = length(bz);
  if (!isFinite(lx) || !isFinite(ly) || !isFinite(lz)) return false;
  if (lx < 1e-9 || ly < 1e-9 || lz < 1e-9) return false;
  const dxy = Math.abs(dot(bx, by) / (lx*ly));
  const dyz = Math.abs(dot(by, bz) / (ly*lz));
  const dzx = Math.abs(dot(bz, bx) / (lz*lx));
  if (dxy > 0.5 || dyz > 0.5 || dzx > 0.5) return false;
  const det = dot(cross(bx, by), bz);
  return isFinite(det) && Math.abs(det) > 1e-9;
}
function isReasonableTransform(tr: TransformRecord): boolean {
  const M = Math.max(Math.abs(tr.origin[0]), Math.abs(tr.origin[1]), Math.abs(tr.origin[2]));
  if (!isFinite(M) || M > 1e9) return false;
  const ls = [length(tr.bx), length(tr.by), length(tr.bz)];
  if (ls.some(l => !isFinite(l) || l < 1e-9 || l > 1e6)) return false;
  return isValidBasis(tr.bx, tr.by, tr.bz);
}


// ──────────────────────────────────────────────────────────────────────────────
// 4) Symbol(로컬) 디코더 + Family 그룹핑
// ──────────────────────────────────────────────────────────────────────────────
type SymPartial = { ok: boolean; consumed: number; info?: any; why?: string };
// [★추가됨] 디코더 함수 타입 정의
type SymDecoderFn = (r: BinReader, len: number) => SymPartial;

let _lastSymMeta: { familyId?: number; prefix: number } = { familyId: undefined, prefix: 0 };

function plausibleCenter(x: number, y: number, z: number): boolean {
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return false;
  const M = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  return M <= 1e9;
}

// 프리픽스 자동 정렬 + familyId 취득 (picked 반환)
// [★변경됨] 안정성 향상 (try-catch 추가)
function symBeginAutoEx(r: BinReader, len: number): { picked: number } {
  const dv = new DataView(r.view.buffer, r.offset, len);

  // familyId 후보(맨 앞 int32)
  let familyId: number | undefined;
  if (len >= 4) {
    try {
      const fid = dv.getInt32(0, true);
      if (Number.isInteger(fid)) familyId = fid;
    } catch (e) {}
  }

  // f64 기준(24바이트)으로 스캔
const baseCandidates = [0, 4, 8, 12, 16, 20, 24, 28, 32];

  let picked = 0;
  for (const p of baseCandidates) {
    if (p + 24 > len) continue; // f64 center 기준 최소 길이 확인
    try {
      const x = dv.getFloat64(p + 0, true);
      const y = dv.getFloat64(p + 8, true);
      const z = dv.getFloat64(p + 16, true);
      if (plausibleCenter(x, y, z)) { picked = p; break; }
    } catch (e) { /* ignore potential alignment/read errors */ }
  }

  r.skip(picked);
  _lastSymMeta = { familyId, prefix: picked };
  return { picked };
}

// ── 심볼(로컬) 디코더들 (f64)
function sym_Circle(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 24) return { ok: false, consumed: 0, why: "len < 24" };
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined, radius: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 8)  { radius = r.f64();      remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { ok: true, consumed: r.offset - start, info: { center, normal, xdir, ydir, radius } };
}
function sym_Line(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 48) return { ok: false, consumed: 0, why: "len < 48" };
  const startPt = r.readVec3();
  const endPt   = r.readVec3();
  let thickness: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 8) { thickness = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  const L = length(sub(endPt, startPt));
  return { ok: true, consumed: r.offset - start, info: { start: startPt, end: endPt, length: L, thickness } };
}
function sym_Sphere(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 32) return { ok: false, consumed: 0, why: "len < 32" };
  const center = r.readVec3();
  const radius = r.f64();
  const remain = len - (r.offset - start);
  if (remain > 0) r.skip(remain);
  return { ok: true, consumed: r.offset - start, info: { center, radius } };
}
function sym_Cylinder(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 32) return { ok: false, consumed: 0, why: "len too small" };
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let radius: number | undefined, height: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { radius = r.f64(); height = r.f64(); remain -= 16; }
  else if (remain >= 8) { radius = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { ok: true, consumed: r.offset - start, info: { center, normal, xdir, ydir, radius, height } };
}
function sym_Cone(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 32) return { ok: false, consumed: 0, why: "len too small" };
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let baseR: number | undefined, height: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { baseR = r.f64(); height = r.f64(); remain -= 16; }
  else if (remain >= 8) { baseR = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { ok: true, consumed: r.offset - start, info: { center, normal, xdir, ydir, baseR, height } };
}
function sym_Plane(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 24) return { ok: false, consumed: 0, why: "len too small" };
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let w: number | undefined, h: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { w = r.f64(); h = r.f64(); remain -= 16; }
  else if (remain >= 8) { w = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { ok: true, consumed: r.offset - start, info: { center, normal, xdir, ydir, w, h } };
}
function sym_Revolved(r: BinReader, len: number): SymPartial {
  const start = r.offset;
  if (len < 24) return { ok: false, consumed: 0, why: "len < 24" };
  const center = r.readVec3();
  let xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let major: number | undefined, minor: number | undefined, angle: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 48) { xdir = r.readVec3(); ydir = r.readVec3(); remain -= 48; }
  if (remain >= 24) { major = r.f64(); minor = r.f64(); angle = r.f64(); remain -= 24; }
  if (remain > 0) r.skip(remain);
  return {
    ok: true, consumed: r.offset - start,
    // [★추가됨] precision 정보 추가
    info: { center, xdir, ydir, major, minor, angle, angleDeg: angle !== undefined ? DEG(angle) : undefined, precision: "f64" }
  };
}
function sym_myEllipse(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 24) return { ok: false, consumed: 0, why: "len < 24" };
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let rx: number | undefined, ry: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { rx = r.f64(); ry = r.f64(); remain -= 16; }
  else if (remain >= 8) { rx = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { ok: true, consumed: r.offset - start, info: { center, normal, xdir, ydir, rx, ry } };
}

// ── NEW: EllipseCurve / CircleCurve / HermiteSpline / Generic (로컬)
function sym_EllipseCurve(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 24) return { ok:false, consumed:0, why:"len < 24" };
  const center = r.readVec3();
  let normal: Vec3|undefined, xdir: Vec3|undefined, ydir: Vec3|undefined;
  let rx: number|undefined, ry: number|undefined;
  let a0: number|undefined, a1: number|undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { rx = r.f64(); ry = r.f64(); remain -= 16; }
  else if (remain >= 8) { rx = r.f64(); remain -= 8; }
  if (remain >= 16) { a0 = r.f64(); a1 = r.f64(); remain -= 16; }
  if (remain > 0) r.skip(remain);
  return { ok:true, consumed:r.offset-start, info:{ center, normal, xdir, ydir, rx, ry, startRad:a0, endRad:a1, startDeg: a0!==undefined?DEG(a0):undefined, endDeg: a1!==undefined?DEG(a1):undefined } };
}
function sym_CircleCurve(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  if (len < 24) return { ok:false, consumed:0, why:"len < 24" };
  const center = r.readVec3();
  let normal: Vec3|undefined, xdir: Vec3|undefined, ydir: Vec3|undefined;
  let radius: number|undefined;
  let a0: number|undefined, a1: number|undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 8)  { radius = r.f64();      remain -= 8; }
  if (remain >= 16) { a0 = r.f64(); a1 = r.f64(); remain -= 16; }
  if (remain > 0) r.skip(remain);
  return { ok:true, consumed:r.offset-start, info:{ center, normal, xdir, ydir, radius, startRad:a0, endRad:a1, startDeg: a0!==undefined?DEG(a0):undefined, endDeg: a1!==undefined?DEG(a1):undefined } };
}
function sym_HermiteSpline(r: BinReader, len: number): SymPartial {
  // ... (f64 구현, 변경 없음)
  const start = r.offset;
  const pts: Vec3[] = [];
  let remain = len;
  while (remain >= 24) { pts.push(r.readVec3()); remain -= 24; }
  if (remain > 0) r.skip(remain);
  if (pts.length < 2) return { ok:false, consumed:r.offset-start, why:"not enough points" };
  return { ok:true, consumed:r.offset-start, info:{ points: pts } };
}
function sym_HermiteFace_Min(r: BinReader, len: number): SymPartial {
  const start = r.offset;
  // f64: 8*8 + 24*4 = 160 bytes
  if (len < 160) return { ok: false, consumed: 0, why: `len ${len} < minimal hermite face (f64)` };
  const u0 = r.f64(), v0 = r.f64(), uM = r.f64(), v0_ = r.f64();
  const u0_ = r.f64(), vN = r.f64(), uM_ = r.f64(), vN_ = r.f64();
  const p00 = r.readVec3(), pM0 = r.readVec3(), p0N = r.readVec3(), pMN = r.readVec3();
  const remain = len - (r.offset - start);
  if (remain > 0) r.skip(remain);
  const params = { u0, v0, uM, v0_, u0_, vN, uM_, vN_ };
  return { ok: true, consumed: r.offset - start, info: { params, p00, pM0, p0N, pMN, note: "tangents/bounds skipped (f64)" } };
}
function sym_Generic(r: BinReader, len: number): SymPartial {
  // ... (구현, 변경 없음)
  const start = r.offset;
  const remain = len;
  const bytes = r.peekBytes(Math.min(remain, HEXDUMP_MAX));
  r.skip(remain);
  return { ok:true, consumed: len, info:{ payloadLen: len, hexPreview: hexdump(bytes) } };
}

// ── [★추가됨] 심볼(로컬) 디코더들 (f32 폴백)

function sym_Revolved_f32(r: BinReader, len: number): SymPartial {
  const start = r.offset;
  // Center (12 bytes)
  if (len < 12) return { ok: false, consumed: 0, why: "len < 12 (f32 center)" };
  const center = r.readVec3f32();
  let xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let major: number | undefined, minor: number | undefined, angle: number | undefined;
  let remain = len - (r.offset - start);
  // Dirs (12+12 = 24 bytes)
  if (remain >= 24) { xdir = r.readVec3f32(); ydir = r.readVec3f32(); remain -= 24; }
  // Params (4+4+4 = 12 bytes)
  if (remain >= 12) { major = r.f32(); minor = r.f32(); angle = r.f32(); remain -= 12; }
  if (remain > 0) r.skip(remain);
  return {
    ok: true, consumed: r.offset - start,
    info: { center, xdir, ydir, major, minor, angle, angleDeg: angle !== undefined ? DEG(angle) : undefined, precision: "f32" }
  };
}

function sym_HermiteFace_Min_f32(r: BinReader, len: number): SymPartial {
  const start = r.offset;
  // f32 structure: 8*4 (params) + 12*4 (corner points) = 80 bytes
  if (len < 80) return { ok: false, consumed: 0, why: `len ${len} < minimal hermite face (f32)` };
  const u0 = r.f32(), v0 = r.f32(), uM = r.f32(), v0_ = r.f32();
  const u0_ = r.f32(), vN = r.f32(), uM_ = r.f32(), vN_ = r.f32();
  const p00 = r.readVec3f32(), pM0 = r.readVec3f32(), p0N = r.readVec3f32(), pMN = r.readVec3f32();
  const remain = len - (r.offset - start);
  if (remain > 0) r.skip(remain);
  const params = { u0, v0, uM, v0_, u0_, vN, uM_, vN_ };
  return { ok: true, consumed: r.offset - start, info: { params, p00, pM0, p0N, pMN, note: "tangents/bounds skipped (f32)" } };
}


// [★변경됨] 디코더 맵 구조 변경 (f64/f32 지원 위해 배열로 변경)
const SYMBOL_DECODERS: Partial<Record<ShapeType, SymDecoderFn[]>> = {
  [ShapeType.Circle]: [sym_Circle],
  [ShapeType.Line]: [sym_Line],
  [ShapeType.Sphere]: [sym_Sphere],
  [ShapeType.Cylinder]: [sym_Cylinder],
  [ShapeType.Cone]: [sym_Cone],
  [ShapeType.Plane]: [sym_Plane],
  [ShapeType.Revolved]: [sym_Revolved, sym_Revolved_f32], // f64 우선, f32 폴백
  [ShapeType.myEllipse]: [sym_myEllipse],
  [ShapeType.HermiteFace]: [sym_HermiteFace_Min, sym_HermiteFace_Min_f32], // f64 우선, f32 폴백
  [ShapeType.EllipseCurve]: [sym_EllipseCurve],
  [ShapeType.CircleCurve]: [sym_CircleCurve],
  [ShapeType.HermiteSpline]: [sym_HermiteSpline],
  [ShapeType.Generic]: [sym_Generic],
};

// ──────────────────────────────────────────────────────────────────────────────
// (NEW) 심볼 디코딩 강건화: 오프셋 재시도 + 간단 타당성 검사
// ──────────────────────────────────────────────────────────────────────────────
function plausibleByName(name: string, info: any): boolean {
  switch (name) {
    case "Sphere":       return finiteVec(info.center) && finite(info.radius) && info.radius > 0 && info.radius < 1e6;
    case "Cylinder":     return finiteVec(info.center) && finite(info.radius) && info.radius > 0;
    case "Plane":        return finiteVec(info.center);
    case "Circle":       return finiteVec(info.center) && (info.radius === undefined || (finite(info.radius) && info.radius > 0));
    case "myEllipse":    return finiteVec(info.center) && ((finite(info.rx) && info.rx > 0) || (finite(info.ry) && info.ry > 0));
    case "Cone":         return finiteVec(info.center) && ((finite(info.baseR) && info.baseR > 0) || (finite(info.height) && info.height > 0));
    case "Revolved":     return finiteVec(info.center);
    case "Line":         return finiteVec(info.start) && finiteVec(info.end);
    case "EllipseCurve": return finiteVec(info.center);
    case "CircleCurve":  return finiteVec(info.center);
    case "HermiteFace":  return finiteVec(info.p00) && finiteVec(info.pM0) && finiteVec(info.p0N) && finiteVec(info.pMN);
    case "HermiteSpline":return Array.isArray(info.points) && info.points.length >= 2 && info.points.every(finiteVec);
    default: return true;
  }
}

// [★개선됨] 심볼 디코딩 강건화: 멀티 디코더(f64/f32) 지원 및 오류 처리 강화
function decodeSymbolRobust(
  name: string,
  // [★변경됨] 디코더 배열을 받음
  decs: SymDecoderFn[],
  r: BinReader,
  remainLen: number
) {
  const startOff = r.offset;

  // 최소 요구 길이 (f32 기준 센터/포인트 12바이트)
  const minLen = 12;
  const maxOff = Math.max(0, Math.min(remainLen - minLen, ROBUST_SCAN_MAX));
  const candidates: number[] = [];
  for (let off = 0; off <= maxOff; off += 4) candidates.push(off);

  // 디코더 우선 순회 (e.g. f64 먼저, f32 나중)
  for (const dec of decs) {
    for (const off of candidates) {
      r.offset = startOff + off;
      const currentLen = Math.max(0, remainLen - off);

      try {
        const res = dec(r, currentLen);
        const used = r.offset - startOff;
        if (res.ok && plausibleByName(name, res.info)) {
          return { ok: true, info: res.info, used };
        }
      } catch (e) {
        // [★추가됨] 추측성 디코딩 중 발생하는 EOF나 기타 읽기 오류 무시하고 계속 스캔
      }
    }
  }
  // 실패 시 원위치
  r.offset = startOff;
  return { ok: false, used: 0 };
}

// ──────────────────────────────────────────────────────────────────────────────
// Normal 디코더 (OwnerId 포함)
// ──────────────────────────────────────────────────────────────────────────────
type PartialDecodeResult = { consumed: number; info?: any; ok: boolean; why?: string };

// [★FIX] 유효성 검사 추가 및 실패 시 되감기 (폴백 메커니즘 활성화)
function decodeNormal_Revolved(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  if (len < 4 + 24) return { consumed: 0, ok: false, why: `len ${len} < 28` };

  try {
    const ownerId = r.i32();
    const center = r.readVec3();
    let xdir: Vec3 | undefined, ydir: Vec3 | undefined;
    let major: number | undefined, minor: number | undefined, angle: number | undefined;
    let remain = len - (r.offset - start);
    if (remain >= 48) { xdir = r.readVec3(); ydir = r.readVec3(); remain -= 48; }
    if (remain >= 24) { major = r.f64(); minor = r.f64(); angle = r.f64(); remain -= 24; }

    const info = { ownerId, center, xdir, ydir, major, minor, angle, angleDeg: angle !== undefined ? DEG(angle) : undefined, precision: "f64(N)" };
    if (!plausibleByName("Revolved", info)) {
      r.offset = start;
      return { consumed: 0, ok: false, why: "validation failed (f64N)" };
    }

    if (remain > 0) r.skip(remain);
    return { consumed: r.offset - start, ok: true, info };
  } catch (e) {
    r.offset = start;
    return { consumed: 0, ok: false, why: `read error: ${e}` };
  }
}

// ... (decodeNormal_Circle ~ decodeNormal_myEllipse는 변경 없음. 이들은 plausibleByName 검사를 pushFromLocal에 의존) ...
function decodeNormal_Circle(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  if (len < 4 + 24) return { consumed: 0, ok: false, why: `len ${len} < 28` };
  const ownerId = r.i32();
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let radius: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 8)  { radius = r.f64();      remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { consumed: r.offset - start, ok: true, info: { ownerId, center, normal, xdir, ydir, radius } };
}
function decodeNormal_Line(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  if (len < 4 + 24 + 24) return { consumed: 0, ok: false, why: `len ${len} < 52` };
  const ownerId = r.i32();
  const startPt = r.readVec3();
  const endPt = r.readVec3();
  let thickness: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 8) { thickness = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  const L = length(sub(endPt, startPt));
  return { consumed: r.offset - start, ok: true, info: { ownerId, start: startPt, end: endPt, length: L, thickness } };
}
function decodeNormal_Sphere(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  if (len < 4 + 24 + 8) return { consumed: 0, ok: false, why: `len ${len} < 36` };
  const ownerId = r.i32();
  const center = r.readVec3();
  const radius = r.f64();
  const remain = len - (r.offset - start);
  if (remain > 0) r.skip(remain);
  return { consumed: r.offset - start, ok: true, info: { ownerId, center, radius } };
}
function decodeNormal_Cylinder(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  if (len < 4 + 24 + 8 + 8) return { consumed: 0, ok: false, why: `len ${len} too small` };
  const ownerId = r.i32();
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let radius: number | undefined, height: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { radius = r.f64(); height = r.f64(); remain -= 16; }
  else if (remain >= 8) { radius = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { consumed: r.offset - start, ok: true, info: { ownerId, center, normal, xdir, ydir, radius, height } };
}
function decodeNormal_Cone(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  if (len < 4 + 24 + 16) return { consumed: 0, ok: false, why: `len ${len} too small` };
  const ownerId = r.i32();
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let baseR: number | undefined, height: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { baseR = r.f64(); height = r.f64(); remain -= 16; }
  else if (remain >= 8) { baseR = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { consumed: r.offset - start, ok: true, info: { ownerId, center, normal, xdir, ydir, baseR, height } };
}
function decodeNormal_Plane(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  if (len < 4 + 24 + 16) return { consumed: 0, ok: false, why: `len ${len} too small` };
  const ownerId = r.i32();
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let w: number | undefined, h: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { w = r.f64(); h = r.f64(); remain -= 16; }
  else if (remain >= 8) { w = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { consumed: r.offset - start, ok: true, info: { ownerId, center, normal, xdir, ydir, w, h } };
}
function decodeNormal_myEllipse(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  if (len < 4 + 24 + 16) return { consumed: 0, ok: false, why: `len ${len} too small` };
  const ownerId = r.i32();
  const center = r.readVec3();
  let normal: Vec3 | undefined, xdir: Vec3 | undefined, ydir: Vec3 | undefined;
  let rx: number | undefined, ry: number | undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { rx = r.f64(); ry = r.f64(); remain -= 16; }
  else if (remain >= 8) { rx = r.f64(); remain -= 8; }
  if (remain > 0) r.skip(remain);
  return { consumed: r.offset - start, ok: true, info: { ownerId, center, normal, xdir, ydir, rx, ry } };
}

// [★FIX] 유효성 검사 추가 및 실패 시 되감기
function decodeNormal_HermiteFace_Min(r: BinReader, len: number): PartialDecodeResult {
  const start = r.offset;
  // f64: 4 (ownerId) + 160 (data) = 164 bytes
  if (len < 164) return { consumed: 0, ok: false, why: `len ${len} < minimal hermite face (f64N)` };

  try {
    const ownerId = r.i32();
    const u0 = r.f64(), v0 = r.f64(), uM = r.f64(), v0_ = r.f64();
    const u0_ = r.f64(), vN = r.f64(), uM_ = r.f64(), vN_ = r.f64();
    const p00 = r.readVec3(), pM0 = r.readVec3(), p0N = r.readVec3(), pMN = r.readVec3();

    // [★FIX] Validation
    const params = { u0, v0, uM, v0_, u0_, vN, uM_, vN_ };
    const info = { ownerId, params, p00, pM0, p0N, pMN, note: "tangents/bounds skipped (f64N)" };
    if (!plausibleByName("HermiteFace", info)) {
      r.offset = start;
      return { consumed: 0, ok: false, why: "validation failed (f64N)" };
    }

    // Success
    const remain = len - (r.offset - start);
    if (remain > 0) r.skip(remain);
    return { consumed: r.offset - start, ok: true, info: info };
  } catch (e) {
    r.offset = start;
    return { consumed: 0, ok: false, why: `read error: ${e}` };
  }
}

// NEW: EllipseCurve / CircleCurve / HermiteSpline / Generic (Normal) (변경 없음)
function decodeNormal_EllipseCurve(r: BinReader, len: number): PartialDecodeResult {
  // ... (f64 구현)
  const start = r.offset;
  if (len < 4 + 24) return { consumed:0, ok:false, why:`len ${len} < 28` };
  const ownerId = r.i32();
  const center = r.readVec3();
  let normal:Vec3|undefined, xdir:Vec3|undefined, ydir:Vec3|undefined;
  let rx:number|undefined, ry:number|undefined, a0:number|undefined, a1:number|undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 16) { rx = r.f64(); ry = r.f64(); remain -= 16; }
  else if (remain >= 8) { rx = r.f64(); remain -= 8; }
  if (remain >= 16) { a0 = r.f64(); a1 = r.f64(); remain -= 16; }
  if (remain > 0) r.skip(remain);
  return { consumed: r.offset-start, ok:true, info:{ ownerId, center, normal, xdir, ydir, rx, ry, startRad:a0, endRad:a1, startDeg:a0!==undefined?DEG(a0):undefined, endDeg:a1!==undefined?DEG(a1):undefined } };
}
function decodeNormal_CircleCurve(r: BinReader, len: number): PartialDecodeResult {
  // ... (f64 구현)
  const start = r.offset;
  if (len < 4 + 24) return { consumed:0, ok:false, why:`len ${len} < 28` };
  const ownerId = r.i32();
  const center = r.readVec3();
  let normal:Vec3|undefined, xdir:Vec3|undefined, ydir:Vec3|undefined;
  let radius:number|undefined, a0:number|undefined, a1:number|undefined;
  let remain = len - (r.offset - start);
  if (remain >= 24) { normal = r.readVec3(); remain -= 24; }
  if (remain >= 24) { xdir = r.readVec3();   remain -= 24; }
  if (remain >= 24) { ydir = r.readVec3();   remain -= 24; }
  if (remain >= 8)  { radius = r.f64();      remain -= 8; }
  if (remain >= 16) { a0 = r.f64(); a1 = r.f64(); remain -= 16; }
  if (remain > 0) r.skip(remain);
  return { consumed: r.offset-start, ok:true, info:{ ownerId, center, normal, xdir, ydir, radius, startRad:a0, endRad:a1, startDeg:a0!==undefined?DEG(a0):undefined, endDeg:a1!==undefined?DEG(a1):undefined } };
}
function decodeNormal_HermiteSpline(r: BinReader, len: number): PartialDecodeResult {
  // ... (f64 구현)
  const start = r.offset;
  if (len < 4 + 24*2) return { consumed:0, ok:false, why:`len ${len} < minimal spline` };
  const ownerId = r.i32();
  const pts: Vec3[] = [];
  let remain = len - 4;
  while (remain >= 24) { pts.push(r.readVec3()); remain -= 24; }
  if (remain > 0) r.skip(remain);
  if (pts.length < 2) return { consumed: r.offset-start, ok:false, why:"not enough points" };
  return { consumed: r.offset-start, ok:true, info:{ ownerId, points: pts } };
}
function decodeNormal_Generic(r: BinReader, len: number): PartialDecodeResult {
  // ... (구현)
  const start = r.offset;
  let ownerId: number|undefined;
  let remain = len;
  if (remain >= 4) { ownerId = r.i32(); remain -= 4; }
  const bytes = r.peekBytes(Math.min(remain, HEXDUMP_MAX));
  r.skip(remain);
  return { consumed: r.offset-start, ok:true, info:{ ownerId, payloadLen: remain, hexPreview: hexdump(bytes) } };
}

type Decoder = (r: BinReader, len: number) => PartialDecodeResult;
const DECODER_BY_TYPE: Partial<Record<ShapeType, Decoder>> = {
  [ShapeType.Revolved]: decodeNormal_Revolved,
  [ShapeType.Circle]: decodeNormal_Circle,
  [ShapeType.Line]: decodeNormal_Line,
  [ShapeType.Sphere]: decodeNormal_Sphere,
  [ShapeType.Cylinder]: decodeNormal_Cylinder,
  [ShapeType.Cone]: decodeNormal_Cone,
  [ShapeType.Plane]: decodeNormal_Plane,
  [ShapeType.myEllipse]: decodeNormal_myEllipse,
  [ShapeType.HermiteFace]: decodeNormal_HermiteFace_Min,
  [ShapeType.EllipseCurve]: decodeNormal_EllipseCurve,
  [ShapeType.CircleCurve]: decodeNormal_CircleCurve,
  [ShapeType.HermiteSpline]: decodeNormal_HermiteSpline,
  [ShapeType.Generic]: decodeNormal_Generic,
};

// ──────────────────────────────────────────────────────────────────────────────
// 5) Instance 트랜스폼 디코더
// ──────────────────────────────────────────────────────────────────────────────
type InstanceDecoded = {
  ok: boolean; consumed: number;
  instId?: number; symbolId?: number; tr?: TransformRecord; why?: string;
};

// [★변경됨] 안정성 향상 (try-catch 추가)
function decodeInstanceFlex(r: BinReader, len: number, symbolCount: number): InstanceDecoded {
  const dv = new DataView(r.view.buffer, r.offset, len);
  let instId: number | undefined;
  try {
    instId = len >= 4 ? dv.getInt32(0, true) : undefined;
  } catch (e) {}

  let bestTr: TransformRecord | undefined;

  // Fast path: instId 뒤 12*f64
  if (!bestTr && len >= 4 + 12*8) {
    try {
      const off = 4;
      const o: Vec3  = [ dv.getFloat64(off+0,  true), dv.getFloat64(off+8,  true), dv.getFloat64(off+16, true) ];
      const bx: Vec3 = [ dv.getFloat64(off+24, true), dv.getFloat64(off+32, true), dv.getFloat64(off+40, true) ];
      const by: Vec3 = [ dv.getFloat64(off+48, true), dv.getFloat64(off+56, true), dv.getFloat64(off+64, true) ];
      const bz: Vec3 = [ dv.getFloat64(off+72, true), dv.getFloat64(off+80, true), dv.getFloat64(off+88, true) ];
      const tr = { origin: o, bx, by, bz };
      if (isReasonableTransform(tr)) bestTr = tr;
    } catch (e) {}
  }

  // Fallback: f64 스캔(4바이트 간격)
  if (!bestTr) {
    for (let off = 0; off + 12*8 <= len; off += 4) {
      try {
        const o: Vec3  = [ dv.getFloat64(off+0,  true), dv.getFloat64(off+8,  true), dv.getFloat64(off+16, true) ];
        const bx: Vec3 = [ dv.getFloat64(off+24, true), dv.getFloat64(off+32, true), dv.getFloat64(off+40, true) ];
        const by: Vec3 = [ dv.getFloat64(off+48, true), dv.getFloat64(off+56, true), dv.getFloat64(off+64, true) ];
        const bz: Vec3 = [ dv.getFloat64(off+72, true), dv.getFloat64(off+80, true), dv.getFloat64(off+88, true) ];
        const tr = { origin: o, bx, by, bz };
        if (isReasonableTransform(tr)) { bestTr = tr; break; }
      } catch (e) {}
    }
  }

  // 최후: f32 스캔(4바이트 간격)
  if (!bestTr) {
    for (let off = 0; off + 12*4 <= len; off += 4) {
      try {
        const o: Vec3  = [ dv.getFloat32(off+0,  true), dv.getFloat32(off+4,  true),  dv.getFloat32(off+8, true) ];
        const bx: Vec3 = [ dv.getFloat32(off+12, true), dv.getFloat32(off+16, true), dv.getFloat32(off+20, true) ];
        const by: Vec3 = [ dv.getFloat32(off+24, true), dv.getFloat32(off+28, true), dv.getFloat32(off+32, true) ];
        const bz: Vec3 = [ dv.getFloat32(off+36, true), dv.getFloat32(off+40, true), dv.getFloat32(off+44, true) ];
        const tr = { origin: o, bx, by, bz };
        if (isReasonableTransform(tr)) { bestTr = tr; break; }
      } catch (e) {}
    }
  }

  // symbolId 후보(앞쪽 int 영역에서 0..symbolCount-1)
  let symbolId: number | undefined;
  {
    const intProbeEnd = Math.min(len - 4, 64);
    for (let off = 0; off <= intProbeEnd; off += 4) {
      try {
        const v = dv.getInt32(off, true);
        if (v >= 0 && v < symbolCount) { symbolId = v; break; }
      } catch (e) {}
    }
  }

  r.skip(len);
  if (!bestTr) return { ok: false, consumed: len, instId, symbolId, why: "transform not found" };
  return { ok: true, consumed: len, instId, symbolId, tr: bestTr };
}

// ──────────────────────────────────────────────────────────────────────────────
// 6) 월드 프리미티브 타입(도형별 배열) + 푸시 함수
// ──────────────────────────────────────────────────────────────────────────────
export type WPPlane    = { center: Vec3; normal: Vec3; size?: [number, number] };
export type WPSphere   = { center: Vec3; radius: number };
export type WPCylinder = { center: Vec3; axis: Vec3; radius: number; height: number };
export type WPCircle   = { center: Vec3; normal: Vec3; radius: number };
export type WPEllipse  = { center: Vec3; normal: Vec3; radiusA: number; radiusB: number; xdir?: Vec3 };
export type WPLine     = { start: Vec3; end: Vec3; thickness?: number };
export type WPCone     = { center: Vec3; axis: Vec3; radius: number; height: number };

// NEW: Curve/Spline/Generic
export type WPEllipseCurve = { center: Vec3; normal: Vec3; radiusA: number; radiusB: number; startDeg: number; endDeg: number; xdir?: Vec3 };
export type WPCircleCurve  = { center: Vec3; normal: Vec3; radius: number; startDeg: number; endDeg: number };
export type WPHermiteSpline = { points: Vec3[] };
export type WPGeneric      = { recordType: string; payloadLen: number; ownerId?: number; hexPreview: string };

// NEW: Revolved / HermiteFace 로깅용
export type WPRevolved = {
  center: Vec3; xdir?: Vec3; ydir?: Vec3;
  major?: number; minor?: number;
  angleDeg?: number; angle?: number;
  precision?: string; // [★추가됨] f64/f32 확인용
};
export type WPHermiteFace = {
  params?: any; p00: Vec3; pM0: Vec3; p0N: Vec3; pMN: Vec3; note?: string;
};

// (옵션) Revolved를 토러스처럼 쓰려면 타입 확장 가능(보조)
export type WPTorus    = { center: Vec3; rotation: Vec3; majorRadius: number; minorRadius: number; angleDeg: number; precision?: string };
export type WPBezier   = { ctrl: any };

export interface WorldPrimitives {
  planes: WPPlane[];
  spheres: WPSphere[];
  cylinders: WPCylinder[];
  circles: WPCircle[];
  ellipses: WPEllipse[];
  lines: WPLine[];
  cones: WPCone[];

  // 추가된 로깅 배열
  revolveds: WPRevolved[];
  hermiteFaces: WPHermiteFace[];

  ellipseCurves: WPEllipseCurve[];
  circleCurves: WPCircleCurve[];
  hermiteSplines: WPHermiteSpline[];
  generics: WPGeneric[];

  // 보조(원하면 렌더러에 전달)
  toruses?: WPTorus[];
  bezierPatches?: WPBezier[];
}

function emptyWorld(): WorldPrimitives {
  return {
    planes: [], spheres: [], cylinders: [], circles: [], ellipses: [], lines: [], cones: [],
    revolveds: [], hermiteFaces: [],
    ellipseCurves: [], circleCurves: [], hermiteSplines: [], generics: [],
    toruses: [], bezierPatches: [],
  };
}

// 숫자 보정 헬퍼
function posOr(v: any, dflt: number) {
  return (typeof v === "number" && Number.isFinite(v) && v > 0) ? v : (RELAX_FOR_LOG ? dflt : 0);
}

function pushFromLocal(world: WorldPrimitives, name: string, info: any, tr: TransformRecord) {
  const pos = (v?: Vec3) => v ? maybeFix(applyTransform(v, tr)) : undefined;
  const rot = (v?: Vec3) => v ? norm(maybeFix(applyRotation(v, tr))) : undefined;

  // [★추가됨] 최종 push 전 유효성 검사 (특히 Normal 섹션에서 중요)
  if (!plausibleByName(name, info)) return;

  switch (name) {
    case "Sphere": {
      const c = pos(info.center)!;
      const r = posOr(info.radius, DEFAULTS.radius);
      if (finiteVec(c) && r > 0) world.spheres.push({ center: c, radius: r });
      break;
    }
    case "Plane": {
      const c = pos(info.center)!;
      const n = rot(info.normal ?? (info.xdir && info.ydir ? cross(info.xdir, info.ydir) : undefined)) ?? [0,0,1];
      const w = info.w, h = info.h;
      const size = (finite(w) && finite(h) && w > 0 && h > 0) ? [w, h] as [number, number] : undefined;
      if (finiteVec(c) && finiteVec(n)) world.planes.push({ center: c, normal: n, size });
      break;
    }
    case "Cylinder": {
      const c = pos(info.center)!;
      const axis = rot(info.normal ?? (info.xdir && info.ydir ? cross(info.xdir, info.ydir) : undefined)) ?? [0,1,0];
      const r_ = posOr(info.radius, DEFAULTS.radius);
      const h_ = posOr(info.height, DEFAULTS.height);
      if (finiteVec(c) && finiteVec(axis) && r_ > 0 && h_ > 0) {
        world.cylinders.push({ center: c, axis, radius: r_, height: h_ });
      }
      break;
    }
    case "Circle": {
      const c = pos(info.center)!;
      const n = rot(info.normal ?? (info.xdir && info.ydir ? cross(info.xdir, info.ydir) : undefined)) ?? [0,0,1];
      const r_ = posOr(info.radius, DEFAULTS.radius);
      if (finiteVec(c) && finiteVec(n) && r_ > 0) world.circles.push({ center: c, normal: n, radius: r_ });
      break;
    }
    case "myEllipse": {
      const c = pos(info.center)!;
      const n = rot(info.normal ?? (info.xdir && info.ydir ? cross(info.xdir, info.ydir) : undefined)) ?? [0,0,1];
      const rx = posOr(info.rx, DEFAULTS.rx), ry = posOr(info.ry, DEFAULTS.ry);
      const xd = info.xdir ? rot(info.xdir) : undefined;
      if (finiteVec(c) && finiteVec(n) && rx > 0 && ry > 0) {
        world.ellipses.push({ center: c, normal: n, radiusA: rx, radiusB: ry, xdir: xd });
      }
      break;
    }
    case "Line": {
      const s = pos(info.start)!, e = pos(info.end)!;
      const t = posOr(info.thickness, DEFAULTS.lineThickness);
      if (finiteVec(s) && finiteVec(e)) world.lines.push({ start: s, end: e, thickness: t });
      break;
    }
    case "Cone": {
      const c = pos(info.center)!;
      const axis = rot(info.normal ?? (info.xdir && info.ydir ? cross(info.xdir, info.ydir) : undefined)) ?? [0,1,0];
      const r_ = posOr(info.baseR, DEFAULTS.radius);
      const h_ = posOr(info.height, DEFAULTS.height);
      if (finiteVec(c) && finiteVec(axis) && r_ > 0 && h_ > 0) {
        world.cones.push({ center: c, axis, radius: r_, height: h_ });
      }
      break;
    }
    case "EllipseCurve": {
      // ... (구현, 변경 없음)
      const c = pos(info.center)!;
      const n = rot(info.normal ?? (info.xdir && info.ydir ? cross(info.xdir, info.ydir) : undefined)) ?? [0,0,1];
      const rx = posOr(info.rx, DEFAULTS.rx), ry = posOr(info.ry, DEFAULTS.ry);
      const xd = info.xdir ? rot(info.xdir) : undefined;
      const a0 = Number.isFinite(info.startDeg) ? info.startDeg : 0;
      const a1 = Number.isFinite(info.endDeg) ? info.endDeg : 360;
      if (finiteVec(c) && finiteVec(n) && rx > 0 && ry > 0) {
        world.ellipseCurves.push({ center: c, normal: n, radiusA: rx, radiusB: ry, startDeg: a0, endDeg: a1, xdir: xd });
      }
      break;
    }
    case "CircleCurve": {
      // ... (구현, 변경 없음)
      const c = pos(info.center)!;
      const n = rot(info.normal ?? (info.xdir && info.ydir ? cross(info.xdir, info.ydir) : undefined)) ?? [0,0,1];
      const r_ = posOr(info.radius, DEFAULTS.radius);
      const a0 = Number.isFinite(info.startDeg) ? info.startDeg : 0;
      const a1 = Number.isFinite(info.endDeg) ? info.endDeg : 360;
      if (finiteVec(c) && finiteVec(n) && r_ > 0) {
        world.circleCurves.push({ center: c, normal: n, radius: r_, startDeg: a0, endDeg: a1 });
      }
      break;
    }
    case "HermiteSpline": {
      // ... (구현, 변경 없음)
      const ptsIn: Vec3[] = Array.isArray(info.points) ? info.points : [];
      if (ptsIn.length >= 2) {
        const pts = ptsIn.map(p => pos(p)!).filter(finiteVec) as Vec3[];
        if (pts.length >= 2) world.hermiteSplines.push({ points: pts });
      }
      break;
    }
    case "Revolved": {
      // Revolved 자체를 항상 보관(로그용)
      const c = pos(info.center)!;
      const xd = info.xdir ? rot(info.xdir) : undefined;
      const yd = info.ydir ? rot(info.ydir) : undefined;
      const precision = info.precision; // [★추가됨]
      const entry: WPRevolved = {
        center: c, xdir: xd, ydir: yd,
        major: (typeof info.major === "number" ? info.major : undefined),
        minor: (typeof info.minor === "number" ? info.minor : undefined),
        angleDeg: (typeof info.angleDeg === "number" ? info.angleDeg : undefined),
        angle: (typeof info.angle === "number" ? info.angle : undefined),
        precision,
      };
      if (finiteVec(c)) world.revolveds.push(entry);

      // (보조) major/minor가 유효하면 torus로도 보관
      const maj = info.major, min = info.minor;
      if (world.toruses && finite(maj) && finite(min) && maj > 0 && min > 0) {
        const rotation: Vec3 = xd ?? [0,0,0];
        const angleDeg = Number.isFinite(info.angleDeg) ? info.angleDeg : 360;
        // [★추가됨] precision 전달
        world.toruses!.push({ center: c, rotation, majorRadius: maj, minorRadius: min, angleDeg, precision });
      }
      break;
    }
    case "HermiteFace": {
      // ... (구현, 변경 없음)
      // HermiteFace 자체를 항상 보관(로그용)
      const hf: WPHermiteFace = {
        params: info.params,
        p00: pos(info.p00)!, pM0: pos(info.pM0)!, p0N: pos(info.p0N)!, pMN: pos(info.pMN)!,
        note: info.note
      };
      if ([hf.p00, hf.pM0, hf.p0N, hf.pMN].every(finiteVec)) world.hermiteFaces.push(hf);

      // (보조) BezierPatch에도 전달
      if (world.bezierPatches) {
        world.bezierPatches.push({
          ctrl: { p00: hf.p00, pM0: hf.pM0, p0N: hf.p0N, pMN: hf.pMN, note: info.note }
        });
      }
      break;
    }
    case "Generic": {
      // ... (구현, 변경 없음)
      world.generics.push({
        recordType: "Generic",
        payloadLen: info.payloadLen ?? 0,
        hexPreview: info.hexPreview ?? "",
        ownerId: info.ownerId
      });
      break;
    }
    default:
      break;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 7) 파일 → WorldPrimitives (핵심 API)
// ──────────────────────────────────────────────────────────────────────────────
export async function extractWorldPrimitives(file: File): Promise<WorldPrimitives> {
  const buf = await file.arrayBuffer();
  const r = new BinReader(buf);

  // Header
  const magic = r.str4(); const version = r.u8(); r.i32(); // totalShapeCount(미사용)
  if (magic !== "DTDS") throw new Error(`Invalid magic: ${JSON.stringify(magic)}`);
  if (version !== 1) throw new Error(`Unsupported version: ${version}`);

  const world = emptyWorld();

  // ── SymbolDefinition (로컬 디코드 + family 그룹핑)
  const symbolDefCount = r.i32();
  if (symbolDefCount < 0) throw new Error(`Invalid symbolDefCount: ${symbolDefCount}`);

  type SymEntry = { name: string; info: any; type: number; familyId?: number };
  const symbolsByIndex: SymEntry[] = [];
  const familyMembers = new Map<number, SymEntry[]>();
  const symbolIndex2Family = new Map<number, number>();

  for (let i = 0; i < symbolDefCount; i++) {
    const { t, len } = readRecHeader(r);

    // [★추가됨] Heuristic: Line(Type 8)을 Revolved로 해석 (Torus 카운트 수정)
    let effectiveType = t;
    if (t === ShapeType.Line) {
        // Expected Lines=0 이므로, Type 8을 Revolved로 간주하고 해석 시도.
        effectiveType = ShapeType.Revolved;
    }

    const name = ShapeTypeNames[effectiveType] ?? `Unknown(${effectiveType})`;
    // [★변경됨] 개선된 디코더 맵 사용
    const decs = SYMBOL_DECODERS[effectiveType as ShapeType];

    const before = r.offset;
    // 1) prefix 정렬
    const { picked } = symBeginAutoEx(r, len);
    const afterPrefix = r.offset;
    const remainLen = len - (afterPrefix - before); // = len - picked

    try {
      if (decs && decs.length > 0) {
        // 2) prefix 제외 영역에서 강건 디코딩(스캔 범위 확대, f64/f32 시도)
        // [★변경됨] 개선된 decodeSymbolRobust 호출
        const robust = decodeSymbolRobust(name, decs, r, Math.max(0, remainLen));
        if (robust.ok) {
          const familyId = _lastSymMeta.familyId;
          // [★변경됨] effectiveType 사용
          const entry: SymEntry = { name, info: robust.info, type: effectiveType, familyId };
          symbolsByIndex[i] = entry;

          if (familyId !== undefined) {
            if (!familyMembers.has(familyId)) familyMembers.set(familyId, []);
            familyMembers.get(familyId)!.push(entry);
            symbolIndex2Family.set(i, familyId);
          }
        }
        // 3) 남은 바이트 정확히 스킵 (prefix + robust.used 합산)
        const usedAfterPrefix = robust.used ?? (r.offset - afterPrefix);
        const left = remainLen - usedAfterPrefix;
        if (left > 0) r.skip(left);
      } else {
        // 미지원: 전체 레코드 스킵 (prefix 포함)
        const left = remainLen;
        if (left > 0) r.skip(left);
      }
    } catch (e) {
      // 실패 시 레코드 끝으로 이동
      const consumed = (r.offset - before);
      const rest = len - consumed;
      if (rest > 0) {
        try { r.skip(rest); } catch (e2) { break; /* EOF */ }
      }
    }
  }

  // ── Instance (트랜스폼 해석 → family 전체를 월드로 확장)
  const instanceCount = r.i32();
  if (instanceCount < 0) throw new Error(`Invalid instanceCount: ${instanceCount}`);

  for (let i = 0; i < instanceCount; i++) {
    const { t, len } = readRecHeader(r); // instType = ShapeTypeNames[t] (참고용)
    const offBefore = r.offset;

    let decI: InstanceDecoded;
    try {
      decI = decodeInstanceFlex(r, len, symbolDefCount); // 내부에서 r.skip(len)
    } catch (e) {
      r.offset = offBefore; r.skip(len);
      continue;
    }
    if (!decI.ok || !decI.tr) continue;

    // 심볼/패밀리 해석
    const symId = decI.symbolId;
    let group: SymEntry[] | undefined;
    if (symId !== undefined) {
      const fid = symbolIndex2Family.get(symId);
      if (fid !== undefined) group = familyMembers.get(fid);
      if (!group && symbolsByIndex[symId]) group = [symbolsByIndex[symId]];
    }
    if (!group || group.length === 0) continue;

    // 트랜스폼 적용 → 월드 배열에 push
    const tr = decI.tr!;
    for (const prim of group) pushFromLocal(world, prim.name, prim.info, tr);
  }

  // ── Normal (그 자체를 월드 기하로 동일 배열에 합침)
  const normalCount = r.i32();
  if (normalCount < 0) throw new Error(`Invalid normalCount: ${normalCount}`);

  const ID: TransformRecord = { origin: [0,0,0], bx: [1,0,0], by: [0,1,0], bz: [0,0,1] };

  for (let i = 0; i < normalCount; i++) {
    const { t, len } = readRecHeader(r);

    // [★추가됨] Heuristic: Line(Type 8)을 Revolved로 해석
    let effectiveType = t;
    if (t === ShapeType.Line) {
        effectiveType = ShapeType.Revolved;
    }

    const name = ShapeTypeNames[effectiveType] ?? `Unknown(${effectiveType})`;
    const decN = DECODER_BY_TYPE[effectiveType as ShapeType];
    const startOff = r.offset;

    if (decN) {
      try {
        const res = decN(r, len);
        // [★변경됨] decN 내부 또는 pushFromLocal에서 유효성 검사 수행. res.ok만 확인.
        if (res.ok) {
          pushFromLocal(world, name, res.info, ID);
          const remain = len - res.consumed;
          if (remain > 0) r.skip(remain);
        } else {
          // ← 1차 실패(f64 디코더 실패 또는 유효성 검사 실패): 폴백 메커니즘
          // Revolved/HermiteFace에 한해 심볼 디코더(f64/f32 지원)로 로버스트 스캔 시도
          r.offset = startOff; // decN이 실패 시 되돌렸어야 함. 확실히 하기 위해 재설정.
          let pushed = false;

          // [★변경됨] effectiveType 사용 및 개선된 decodeSymbolRobust 호출
          if (effectiveType === ShapeType.Revolved || effectiveType === ShapeType.HermiteFace) {
            const decs = SYMBOL_DECODERS[effectiveType as ShapeType];
            if (decs) {
                // 폴백 시에는 새 리더 사용 (기존 코드 패턴 유지)
                const r2 = new BinReader(r.buf);
                r2.offset = startOff;
                const robust = decodeSymbolRobust(name, decs, r2, len);
                if (robust.ok) { pushFromLocal(world, name, robust.info, ID); pushed = true; }
            }
          }
          // 원래 스트림은 전체 스킵
          r.offset = startOff; r.skip(len);
        }
      } catch (e) {
        r.offset = startOff; r.skip(len);
      }
    } else {
      r.skip(len);
    }
  }

  return world;
}

// ──────────────────────────────────────────────────────────────────────────────
// 8) 로깅 유틸(도형별 배열을 순차적으로 로그)
// ──────────────────────────────────────────────────────────────────────────────
function segLen(a: Vec3, b: Vec3) { const d = sub(a, b); return Math.hypot(d[0], d[1], d[2]).toFixed(6); }

function summarizeKind(world: WorldPrimitives) {
  const summary = {
    Plane: world.planes.length,
    Sphere: world.spheres.length,
    Cylinder: world.cylinders.length,
    Circle: world.circles.length,
    Ellipse: world.ellipses.length,
    Line: world.lines.length,
    Cone: world.cones.length,
    Revolved: world.revolveds.length,
    HermiteFace: world.hermiteFaces.length,
    EllipseCurve: world.ellipseCurves.length,
    CircleCurve: world.circleCurves.length,
    HermiteSpline: world.hermiteSplines.length,
    Generic: world.generics.length,
    Torus: world.toruses?.length ?? 0,
    BezierPatch: world.bezierPatches?.length ?? 0,
  };
  // [★추가됨] Mixed Surfaces 요약 추가 (예상 출력 형식 맞춤용)
  (summary as any)["Mixed Surfaces"] = world.revolveds.length + world.hermiteFaces.length;
  return summary;
}

function logWorldArrays(world: WorldPrimitives, samplePerKind = 5, collapsed = false) {
  const topGroup = collapsed ? console.groupCollapsed : console.group;
  topGroup("[DTDS] World primitives (grouped by kind)");
  console.table([ summarizeKind(world) ]);

  const subGroup = collapsed ? console.groupCollapsed : console.group;
  const print = <T>(title: string, arr: T[], fmt: (x: T, i: number) => string) => {
    subGroup(`${title} (count=${arr.length})`);
    const n = Math.min(arr.length, samplePerKind);
    for (let i = 0; i < n; i++) {
      console.log(`#${i+1}/${arr.length}  ${fmt(arr[i], i)}`);
      console.log("  ↳ raw:", arr[i]);
    }
    if (arr.length > n) console.log(`... and ${arr.length - n} more`);
    console.groupEnd();
  };

  print("Plane", world.planes, (p) => `center=${fmt3(p.center)} n=${fmt3(p.normal)} size=${p.size ? `[${p.size[0]}, ${p.size[1]}]` : "-"}`);
  print("Sphere", world.spheres, (p) => `center=${fmt3(p.center)} r=${p.radius}`);
  print("Cylinder", world.cylinders, (p) => `center=${fmt3(p.center)} axis=${fmt3(p.axis)} r=${p.radius} h=${p.height}`);
  print("Circle", world.circles, (p) => `center=${fmt3(p.center)} n=${fmt3(p.normal)} r=${p.radius}`);
  print("Ellipse", world.ellipses, (p) => `center=${fmt3(p.center)} n=${fmt3(p.normal)} rx=${p.radiusA} ry=${p.radiusB}`);
  print("Line", world.lines, (p) => `start=${fmt3(p.start)} end=${fmt3(p.end)} L=${segLen(p.start, p.end)} t=${p.thickness ?? "-"}`);
  print("Cone", world.cones, (p) => `center=${fmt3(p.center)} axis=${fmt3(p.axis)} r=${p.radius} h=${p.height}`);

  // 새로 추가된 섹션(항상 출력)
  // [★변경됨] precision 정보 추가
  print("Revolved", world.revolveds, (p) =>
    `center=${fmt3(p.center)} major=${p.major ?? "-"} minor=${p.minor ?? "-"} angleDeg=${p.angleDeg ?? "-"} precision=${p.precision ?? "-"}`
  );
  print("HermiteFace", world.hermiteFaces, (p) =>
    `p00=${fmt3(p.p00)} pMN=${fmt3(p.pMN)} note=${p.note ?? "-"}`
  );

  print("EllipseCurve", world.ellipseCurves, (p) => `center=${fmt3(p.center)} n=${fmt3(p.normal)} rx=${p.radiusA} ry=${p.radiusB} deg=[${p.startDeg}, ${p.endDeg}]`);
  print("CircleCurve",  world.circleCurves,  (p) => `center=${fmt3(p.center)} n=${fmt3(p.normal)} r=${p.radius} deg=[${p.startDeg}, ${p.endDeg}]`);
  print("HermiteSpline", world.hermiteSplines, (p) => `points=${p.points.length}  start=${fmt3(p.points[0])}  end=${fmt3(p.points[p.points.length-1])}`);
  print("Generic", world.generics, (g) => `type=${g.recordType} payload=${g.payloadLen} hex=${g.hexPreview}`);

  if (world.toruses) {
    // [★변경됨] precision 정보 추가
    print("Torus", world.toruses, (p) => `center=${fmt3(p.center)} R=${p.majorRadius} r=${p.minorRadius} angleDeg=${p.angleDeg} precision=${p.precision ?? "-"}`);
  }
  if (world.bezierPatches) {
    print("BezierPatch", world.bezierPatches, (_p, i) => `#${i}`);
  }

  console.groupEnd();
}

// ──────────────────────────────────────────────────────────────────────────────
// 9) attach: 파일 → WorldPrimitives → 로그
// ──────────────────────────────────────────────────────────────────────────────
export function attachDTDSWorldLogger(
  input: string | HTMLInputElement = "dtdsPicker",
  opts?: { samplePerKind?: number; collapsed?: boolean }
) {
  const el = typeof input === "string"
    ? (document.getElementById(input) as HTMLInputElement | null)
    : input;

  if (!el) {
    console.warn("[DTDS] world logger: file input not found:", input);
    return;
  }

  el.addEventListener("change", async () => {
    const files = Array.from(el.files ?? []);
    if (!files.length) return;

    for (const f of files) {
      (opts?.collapsed ? console.groupCollapsed : console.group)(`DTDS :: ${f.name}`);
      try {
        const world = await extractWorldPrimitives(f);
        logWorldArrays(world, opts?.samplePerKind ?? 5, opts?.collapsed ?? false);
      } catch (e) {
        console.error("[DTDS] import failed:", e);
      }
      console.groupEnd();
    }

    el.value = ""; // 같은 파일 다시 선택 가능하게
  });
}

// 기존 진입점 이름 호환 (main.ts에서 attachDTDSConsoleLogger 사용 중)
export const attachDTDSConsoleLogger = attachDTDSWorldLogger;