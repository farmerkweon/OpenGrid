// @vitest-environment node
/**
 * 넓은 그리드 새 그물 — ColumnWindowPolicy · 규칙 넷 단위 시험. 테스트 설계서 §2-3 U-WIN-20~49.
 *
 * 기하는 계약 `IColumnGeometry` 의 **가짜 구현**(손으로 만든 객체)으로 준다 — 같은 걸음에 다른 레인이
 * 실제 `ColumnGeometry` 를 만드는 중이라 그것에 기대지 않는다. 실제 클래스가 있으면 끝의 describe 가 그것으로도 돈다.
 * 기본 준비 P50: 50컬럼 × 180(전체 9,000), extra 0, frozen 0, box.width 1,900, 여유 950, 규칙 넷 모두 허용.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ColumnWindowPolicy } from '../../../src/core/coordinate/ColumnWindowPolicy.js';
import { ColumnWindow } from '../../../src/core/coordinate/ColumnWindow.js';
import type {
  IColumnGeometry, IExtraColumns, GeometryChange, GridShape, WindowQuery, IColumnWindow, WindowRule,
} from '../../../src/core/coordinate/geometryPorts.js';
import type { LeafColIndex, Px } from '../../../src/core/coordinate/types.js';

// ── 씨앗 난수(mulberry32 — wg-helpers/random-ops.ts 와 같은 식. 그 파일은 DOM 쪽 장면을 끌어와 node 에서 안 씀) ──
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 가짜 기하(호출 기록) ──
class FakeExtra implements IExtraColumns {
  readonly ids = [] as const;
  constructor(private readonly w: number) {}
  widthOf(): Px { return 0 as Px; }
  leftOf(): Px { return 0 as Px; }
  width(): Px { return this.w as Px; }
  legacyWidthWithoutDetail(): Px { return this.w as Px; }
}

class FakeGeometry implements IColumnGeometry {
  version = 1;
  extra: IExtraColumns;
  frozenCount = 0;
  readonly calls = { colAt: 0, leftOf: 0, widthOf: 0, widths: 0 };
  private left: number[] = [];
  private ws: readonly number[] = [];
  constructor(ws: readonly number[], extraW = 0, frozenCount = 0) {
    this.extra = new FakeExtra(extraW);
    this.reset(ws, extraW, frozenCount);
  }
  /** 구성 바꾸기(계약대로 고정 수는 [0,count] 로 잘림). */
  reset(ws: readonly number[], extraW = 0, frozenCount = 0): void {
    this.ws = ws;
    this.extra = new FakeExtra(extraW);
    this.frozenCount = Math.min(Math.max(0, frozenCount), ws.length);
    this.left = [extraW];
    for (let i = 0; i < ws.length; i++) this.left.push(this.left[i]! + ws[i]!);
    this.version++;
  }
  get count(): number { return this.ws.length; }
  widthOf(ci: LeafColIndex): Px { this.calls.widthOf++; return (this.ws[ci] ?? 0) as Px; }
  leftOf(ci: LeafColIndex): Px { this.calls.leftOf++; return this.left[Math.max(0, Math.min(ci, this.ws.length))]! as Px; }
  spanWidth(ci: LeafColIndex, span: number): Px { return (this.left[ci + span]! - this.left[ci]!) as Px; }
  totalWidth(): Px { return this.left[this.ws.length]! as Px; }
  frozenRight(): Px { return this.left[this.frozenCount]! as Px; }
  colAt(x: Px): LeafColIndex {
    this.calls.colAt++;
    // 경계 x(= leftOf(i))는 i 에 속함(U-GEO-07 규칙). 여분 구역·음수는 0, 끝 너머는 마지막.
    const n = this.ws.length;
    if (n === 0) return 0 as LeafColIndex;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.left[mid]! <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo as LeafColIndex;
  }
  widths(): readonly number[] { this.calls.widths++; return this.ws; }
  changesSince(): GeometryChange {
    return { none: true, widthCols: [], leftFrom: this.ws.length as LeafColIndex, totalChanged: false, structural: false, version: 1 };
  }
}

const SHAPE: GridShape = { autoHeight: false, viewportWidth: 1900, mergeEmpty: true, virtualColumns: true };
const shapeW = (w: number): GridShape => ({ ...SHAPE, viewportWidth: w });
const q = (scrollLeft: number, width = 1900, pinned: number[] = []): WindowQuery =>
  ({ box: { scrollLeft, width }, pinned: pinned as LeafColIndex[] });
const segs = (w: IColumnWindow) => w.segments.map((s) => [s.from, s.to]);
const fill = (n: number, v: number) => new Array<number>(n).fill(v);

function P50(opts: { extra?: number; frozen?: number; widths?: number[]; rules?: readonly WindowRule[] } = {}) {
  const g = new FakeGeometry(opts.widths ?? fill(50, 180), opts.extra ?? 0, opts.frozen ?? 0);
  const p = new ColumnWindowPolicy(g, opts.rules ?? ColumnWindowPolicy.defaultRules());
  return { g, p };
}

/** U-WIN-24 성질 ①~④ 판정(실패 시 설명 문자열). */
function checkProps(g: FakeGeometry, w: IColumnWindow, sl: number, width: number, margin: number, pinned: number[]): string | null {
  const n = g.count;
  const F = Math.min(g.frozenCount, n);
  // ③ 오름차순·안 겹침
  let prev = -1;
  for (const s of w.segments) {
    if (s.from > s.to || s.from <= prev) return `③ 구간 순서 ${JSON.stringify(segs(w))}`;
    prev = s.to;
  }
  for (let c = 0; c < n; c++) {
    const l = g.leftOf(c as LeafColIndex);
    const r = g.leftOf((c + 1) as LeafColIndex);
    const inside = w.contains(c as LeafColIndex);
    // ① 보이는 범위와 겹치는 컬럼은 창 안
    if (l < sl + width && r > sl && !inside) return `① 보이는 컬럼 ${c} 빠짐`;
    // ② 고정 [0,F−1] ⊂ 창
    if (c < F && !inside) return `② 고정 ${c} 빠짐`;
    // ④ 창 밖(고정·꼭 넣을 것 아님) 컬럼은 보이는 범위에서 여유 넘게(먼 쪽 끝으로는 여유 + 자기 폭 넘게) 떨어져 있음
    if (!inside && c >= F && !pinned.includes(c)) {
      const farLeft = r <= sl - margin; // 왼쪽: 오른쪽 끝이 보이는 왼쪽에서 여유 이상
      const farRight = l > sl + width + margin; // 오른쪽: 왼쪽 끝이 보이는 오른쪽에서 여유 넘게
      if (!farLeft && !farRight) return `④ 컬럼 ${c} 가 여유 안인데 창 밖`;
    }
  }
  return null;
}

describe('ColumnWindowPolicy — U-WIN-20~49', () => {
  it('U-WIN-20 compute 맨 왼쪽', () => {
    const { p } = P50();
    const w = p.compute(q(0), SHAPE);
    expect(segs(w)).toEqual([[0, 15]]);
    expect(w.gaps().map((s) => [s.from, s.to])).toEqual([[16, 49]]);
  });

  it('U-WIN-21 가운데', () => {
    const { p } = P50();
    expect(segs(p.compute(q(3000), SHAPE))).toEqual([[11, 32]]);
  });

  it('U-WIN-22 맨 끝', () => {
    const { p } = P50();
    expect(segs(p.compute(q(7100), SHAPE))).toEqual([[34, 49]]);
  });

  it('U-WIN-23 고정 컬럼 늘 포함', () => {
    const { g, p } = P50({ frozen: 2 });
    const w = p.compute(q(3000), SHAPE);
    expect(segs(w)[0]).toEqual([0, 1]);
    expect(w.segments.length).toBe(2);
    expect(checkProps(g, w, 3000, 1900, 950, [])).toBeNull();
  });

  it('U-WIN-24 성질 무작위 — 씨앗 8 × 500회', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rnd = mulberry32(seed);
      const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
      for (let k = 0; k < 500; k++) {
        const n = ri(1, 200);
        const ws = Array.from({ length: n }, () => ri(40, 2000));
        const extra = rnd() < 0.5 ? 0 : ri(1, 200);
        const frozen = ri(0, 3);
        const width = ri(300, 4000);
        const g = new FakeGeometry(ws, extra, frozen);
        const p = new ColumnWindowPolicy(g, ColumnWindowPolicy.defaultRules());
        const total = g.totalWidth();
        const sl = ri(0, Math.max(0, total - width));
        const pinned = rnd() < 0.3 ? [ri(0, n - 1)] : [];
        const w = p.compute(q(sl, width, pinned), shapeW(width));
        const margin = Math.max(400, width * 0.5);
        const bad = checkProps(g, w, sl, width, margin, pinned);
        if (bad !== null) throw new Error(`seed ${seed} #${k} n=${n} extra=${extra} F=${frozen} w=${width} sl=${sl}: ${bad}`);
        for (const pc of pinned) expect(w.contains(pc as LeafColIndex)).toBe(true);
      }
    }
  });

  it('U-WIN-25 작은 화면 여유 하한 400', () => {
    const { p } = P50();
    expect(segs(p.compute(q(3000, 600), shapeW(600)))).toEqual([[14, 22]]);
  });

  // [검토 V-02 뒤 새 기대 — CF] 꼭 넣을 컬럼은 창을 「껍질」로 넓히지 않고 따로 한 칸짜리 토막(넓히면 칸 하나 누른 뒤 가상화가 사실상 풀림).
  // 창 = col(scrollLeft − 950) ~ col(scrollLeft + 1,900 + 950), 컬럼 180: 0 → [0, ⌊2,850/180⌋=15] + 따로 [45].
  it('U-WIN-26 꼭 넣을 컬럼(오른쪽 먼 곳) — 따로 한 토막', () => {
    const { p } = P50();
    expect(segs(p.compute(q(0, 1900, [45]), SHAPE))).toEqual([[0, 15], [45, 45]]);
  });

  // 7,100: [⌊6,150/180⌋=34, 끝 49] + 따로 [3].
  it('U-WIN-27 꼭 넣을 컬럼(왼쪽 먼 곳) — 따로 한 토막', () => {
    const { p } = P50();
    expect(segs(p.compute(q(7100, 1900, [3]), SHAPE))).toEqual([[3, 3], [34, 49]]);
  });

  it('U-WIN-28 고정 안 pinned 는 껍질을 안 넓힘', () => {
    const { p } = P50({ frozen: 2 });
    const a = p.compute(q(3000, 1900, [1]), SHAPE);
    const b = p.compute(q(3000), SHAPE);
    expect(a.equals(b)).toBe(true);
  });

  // 3,000: [⌊2,050/180⌋=11, ⌊5,850/180⌋=32] + 따로 [5]·[40].
  it('U-WIN-29 pinned 둘 — 각각 따로 한 토막', () => {
    const { p } = P50();
    expect(segs(p.compute(q(3000, 1900, [5, 40]), SHAPE))).toEqual([[5, 5], [11, 32], [40, 40]]);
  });

  it('U-WIN-30 범위 밖 pinned — 던지지 않고 무시', () => {
    const { p } = P50();
    const a = p.compute(q(3000, 1900, [99, -1, 2.5, Number.NaN]), SHAPE);
    expect(a.equals(p.compute(q(3000), SHAPE))).toBe(true);
  });

  it('U-WIN-31 아주 넓은 컬럼 하나', () => {
    const ws = [...fill(10, 180), 20000, ...fill(39, 180)];
    const { g, p } = P50({ widths: ws });
    const w = p.compute(q(5000), SHAPE);
    expect(w.contains(10 as LeafColIndex)).toBe(true);
    expect(w.segments.length).toBe(1);
    expect(checkProps(g, w, 5000, 1900, 950, [])).toBeNull();
  });

  it('U-WIN-32 전 컬럼이 들어오는 작은 그리드는 full', () => {
    const { p } = P50({ widths: fill(5, 180) });
    expect(p.compute(q(0), SHAPE).full).toBe(true);
  });

  it('U-WIN-33 폭 모름(0) → full (UnknownWidthRule)', () => {
    const { p } = P50();
    expect(p.compute(q(0, 0), shapeW(0)).full).toBe(true);
  });

  it('U-WIN-34 여분 구역은 컬럼 0 의 폭이 아님', () => {
    const { p } = P50({ extra: 150 });
    expect(segs(p.compute(q(0), SHAPE))).toEqual([[0, 15]]);
    expect(segs(p.compute(q(100), SHAPE))).toEqual([[0, 15]]); // 오른쪽 x 2,950 → 15 (여분을 무시하면 16)
  });

  it('U-WIN-35 AutoHeightRule', () => {
    const { p } = P50();
    expect(p.compute(q(3000), { ...SHAPE, autoHeight: true }).full).toBe(true);
  });

  it('U-WIN-36 MergeActiveRule (원천은 GridShape.mergeEmpty 하나 — 검토 W-6)', () => {
    const { p } = P50();
    expect(p.compute(q(3000), { ...SHAPE, mergeEmpty: false }).full).toBe(true);
    // 런타임에 병합을 켜고 끄면(모양이 바뀜) 같은 정책이 full ↔ 창으로 따라감
    expect(p.compute(q(3000), SHAPE).full).toBe(false);
    expect(p.compute(q(3000), { ...SHAPE, mergeEmpty: false }).full).toBe(true);
    expect(p.compute(q(3000), SHAPE).full).toBe(false);
    expect(ColumnWindowPolicy.defaultRules.length).toBe(0); // 인자 없음 — 병합 원천을 따로 받지 않음
  });

  it('U-WIN-37 OptOutRule', () => {
    const { p } = P50();
    expect(p.compute(q(3000), { ...SHAPE, virtualColumns: false }).full).toBe(true);
  });

  it('U-WIN-38 규칙 넷 허용이면 창', () => {
    const { p } = P50();
    expect(p.compute(q(0), SHAPE).full).toBe(false);
  });

  it('U-WIN-39 규칙 순서 무관', () => {
    const rules = ColumnWindowPolicy.defaultRules();
    expect(rules.map((r) => r.id).sort()).toEqual(['autoHeight', 'mergeActive', 'optOut', 'unknownWidth']);
    const orders = [rules, [...rules].reverse(), [rules[2]!, rules[0]!, rules[3]!, rules[1]!]];
    const shapes: GridShape[] = [SHAPE, { ...SHAPE, autoHeight: true }, shapeW(0), { ...SHAPE, mergeEmpty: false }, { ...SHAPE, virtualColumns: false }];
    for (const sh of shapes) {
      const ws = orders.map((r) => new ColumnWindowPolicy(new FakeGeometry(fill(50, 180)), r).compute(q(3000), sh));
      expect(ws[0]!.equals(ws[1]!)).toBe(true);
      expect(ws[0]!.equals(ws[2]!)).toBe(true);
    }
  });

  it('U-WIN-40 규칙 더하기 — 사용자 규칙 하나가 false 면 full', () => {
    const rules = [...ColumnWindowPolicy.defaultRules(), { id: 'x', allowsWindow: () => false }];
    const { p } = P50({ rules });
    expect(p.compute(q(0), SHAPE).full).toBe(true);
  });

  it('U-WIN-41 covers 같은 자리', () => {
    const { p } = P50();
    const drawn = p.compute(q(3000), SHAPE);
    expect(p.covers(drawn, q(3000))).toBe(true);
  });

  it('U-WIN-42 covers 이력 안쪽 경계(px)', () => {
    const { p } = P50();
    const drawn = p.compute(q(3000), SHAPE);
    expect(segs(drawn)).toEqual([[11, 32]]); // px [1,980, 5,940)
    expect(p.covers(drawn, q(2455))).toBe(true);
    expect(p.covers(drawn, q(3565))).toBe(true);
  });

  it('U-WIN-43 covers 이력 바깥 경계(px — Q-09 답)', () => {
    const { p } = P50();
    const drawn = p.compute(q(3000), SHAPE);
    expect(p.covers(drawn, q(2454))).toBe(false);
    expect(p.covers(drawn, q(3566))).toBe(false);
  });

  // 경우변경(검토 W-1 ⓑ, 총괄 지시): 「full 은 늘 덮음」 → 「full 은 늘 covers false, 대신 compute 가 같은 full 객체를 돌려줌」.
  // 지키려던 것(full 인데 창을 다시 짜 끝 칸 차분을 부름)은 compute 결과가 그려 둔 창과 같은 객체라 equals 가 바로 같다고 답하는 것으로 지킨다.
  it('U-WIN-44 full 은 covers false · compute 가 같은 full 객체를 돌려줌(창 일 0)', () => {
    const { p } = P50();
    const drawn = p.compute(q(0, 0), shapeW(0)); // 폭 모름 → full
    expect(drawn.full).toBe(true);
    for (const sl of [0, 3000, 7100]) {
      expect(p.covers(drawn, q(sl, 0))).toBe(false);
      const again = p.compute(q(sl, 0), shapeW(0));
      expect(again).toBe(drawn);
      expect(again.equals(drawn)).toBe(true);
    }
    // 작은 그리드(전 컬럼이 들어옴)도 같은 full 객체
    const small = P50({ widths: fill(5, 180) });
    const d2 = small.p.compute(q(0), SHAPE);
    expect(small.p.covers(d2, q(0))).toBe(false);
    expect(small.p.compute(q(0), SHAPE)).toBe(d2);
    // 남이 만든 full(같은 컬럼 수)도 equals 로는 같음
    expect(p.compute(q(0, 0), shapeW(0)).equals(ColumnWindow.full(50))).toBe(true);
  });

  it('U-WIN-45 pinned 바뀜 → covers false', () => {
    const { p } = P50();
    const drawn = p.compute(q(3000), SHAPE);
    expect(p.covers(drawn, q(3000, 1900, [45]))).toBe(false);
  });

  it('U-WIN-46 보이는 폭 커짐 → covers false', () => {
    const { p } = P50();
    const drawn = p.compute(q(3000, 1900), SHAPE);
    expect(p.covers(drawn, q(3000, 3800))).toBe(false);
  });

  it('U-WIN-47 결정적', () => {
    const { p } = P50({ frozen: 1 });
    const a = p.compute(q(4321, 1900, [44]), SHAPE);
    const b = p.compute(q(4321, 1900, [44]), SHAPE);
    expect(a.equals(b)).toBe(true);
  });

  it('U-WIN-48 기존 포트 IWindowingPort.horizontalWindow 호환({start,end} 반열림)', () => {
    const { p } = P50();
    for (const sl of [0, 3000, 7100]) {
      const w = p.compute(q(sl), SHAPE);
      const h = p.horizontalWindow(sl as Px, 1900 as Px);
      const fromCompute: number[] = [];
      w.forEachColumn((c) => fromCompute.push(c));
      const fromPort: number[] = [];
      for (let c = h.start; c < h.end; c++) fromPort.push(c);
      expect(fromPort).toEqual(fromCompute);
    }
    // 폭 0 이면 전 컬럼(같은 규칙)
    const h0 = p.horizontalWindow(0 as Px, 0 as Px);
    expect([h0.start, h0.end]).toEqual([0, 50]);
  });

  it('U-WIN-49 정책은 기하만 읽고 전 컬럼을 훑지 않음', () => {
    const { g, p } = P50({ frozen: 2 });
    const w = p.compute(q(3000, 1900, [40]), SHAPE);
    let cols = 0;
    w.forEachColumn(() => cols++);
    expect(g.calls.colAt).toBeLessThanOrEqual(4);
    expect(g.calls.leftOf + g.calls.widthOf).toBeLessThanOrEqual(cols * 2);
    expect(g.calls.widths).toBe(0);
    // covers 도 컬럼 수에 비례하지 않음
    const before = g.calls.leftOf + g.calls.widthOf + g.calls.colAt;
    p.covers(w, q(3100, 1900, [40]));
    expect(g.calls.leftOf + g.calls.widthOf + g.calls.colAt - before).toBeLessThanOrEqual(8);
    expect(g.calls.widths).toBe(0);
  });
});

// ── R1 코드 검토(REVIEW_CODE_R1 §4-2 W-1·W-3, §5-3 T-5) — 검토의 깨 보기 P-WIN-01·02·03·04·06 을 옮김 ──
describe('ColumnWindowPolicy — 검토 W-1·W-3 (T-5)', () => {
  it('W-1 P-WIN-01 고정 수가 0→2 로 바뀌면 고정 없는 옛 창은 covers false', () => {
    const { g, p } = P50();
    const drawn = p.compute(q(3000), SHAPE);
    expect(p.covers(drawn, q(3000))).toBe(true);
    g.reset(fill(50, 180), 0, 2);
    expect(p.covers(drawn, q(3000))).toBe(false);
    const fresh = p.compute(q(3000), SHAPE);
    expect(segs(fresh)[0]).toEqual([0, 1]);
    expect(p.covers(fresh, q(3000))).toBe(true);
  });

  it('W-1 고정 수가 2→3 로 늘면(옛 고정 구간이 고정 끝을 못 담음) covers false', () => {
    const { g, p } = P50({ frozen: 2 });
    const drawn = p.compute(q(3000), SHAPE); // [{0,1},{11,32}]
    g.reset(fill(50, 180), 0, 3);
    expect(p.covers(drawn, q(3000))).toBe(false);
  });

  it('W-1 P-WIN-02 컬럼 수가 50→60 으로 바뀌면 옛 창(비 full)은 covers false', () => {
    const { g, p } = P50();
    const drawn = p.compute(q(3000), SHAPE);
    g.reset(fill(60, 180));
    expect(p.covers(drawn, q(3000))).toBe(false);
    expect(p.compute(q(3000), SHAPE).count).toBe(60);
    // 줄어도 마찬가지
    g.reset(fill(40, 180));
    expect(p.covers(drawn, q(3000))).toBe(false);
  });

  it('W-1 P-WIN-03 폭 모름으로 그린 full 은 폭이 알려지면 compute 가 창으로 바꿈(covers 는 false)', () => {
    const { p } = P50();
    const drawn = p.compute(q(0, 0), shapeW(0));
    expect(drawn.full).toBe(true);
    expect(p.covers(drawn, q(0, 1900))).toBe(false);
    expect(p.compute(q(0, 1900), SHAPE).full).toBe(false);
  });

  it('W-3 P-WIN-04 scrollLeft NaN·Infinity·음수 → 0 으로 보고 보이는 컬럼을 담음', () => {
    const { p } = P50();
    const at0 = p.compute(q(0), SHAPE);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -500]) {
      const w = p.compute(q(bad), SHAPE);
      expect([bad, w.equals(at0)]).toEqual([bad, true]);
      expect(p.covers(at0, q(bad))).toBe(true);
    }
    // 폭 NaN 은 폭 모름과 같음(0)
    expect(segs(p.compute(q(0, Number.NaN), SHAPE))).toEqual([[0, 2]]); // 0 + 여유 400 → colAt(400) = 2
  });

  it('W-3 P-WIN-06 scrollLeft 가 끝 너머 → [0, 전체 폭 − 보이는 폭] 에 묶음', () => {
    const { p } = P50();
    const end = p.compute(q(7100), SHAPE);
    const beyond = p.compute(q(9_999_999), SHAPE);
    expect(beyond.contains(34 as LeafColIndex)).toBe(true);
    expect(beyond.equals(end)).toBe(true);
    expect(p.covers(end, q(9_999_999))).toBe(true);
    // 보이는 폭이 전체보다 넓으면 묶는 끝은 0
    const small = P50({ widths: fill(8, 180) });
    expect(small.p.compute(q(5000), SHAPE).full).toBe(true);
  });
});

// ── 실제 ColumnGeometry 가 있으면(같은 걸음의 다른 레인 산출물) 그것으로도 한 번 돈다 ──
const REAL = resolve(__dirname, '../../../src/core/coordinate/ColumnGeometry.ts');
const REAL_EXTRA = resolve(__dirname, '../../../src/core/coordinate/ExtraColumns.ts');
describe.runIf(existsSync(REAL) && existsSync(REAL_EXTRA))('ColumnWindowPolicy × 실제 ColumnGeometry', () => {
  it('U-WIN-20·21·22·34·42·43 을 실제 기하로', async () => {
    const geoMod: Record<string, unknown> = await import(/* @vite-ignore */ REAL);
    const extMod: Record<string, unknown> = await import(/* @vite-ignore */ REAL_EXTRA);
    type Ctor = new (w: readonly number[], e: IExtraColumns, f: number) => IColumnGeometry;
    const ColumnGeometry = geoMod['ColumnGeometry'] as Ctor;
    const ExtraColumns = extMod['ExtraColumns'] as { fromOptions(o: object): IExtraColumns };
    const none = ExtraColumns.fromOptions({});
    const g = new ColumnGeometry(fill(50, 180), none, 0);
    const p = new ColumnWindowPolicy(g, ColumnWindowPolicy.defaultRules());
    expect(segs(p.compute(q(0), SHAPE))).toEqual([[0, 15]]);
    expect(segs(p.compute(q(3000), SHAPE))).toEqual([[11, 32]]);
    expect(segs(p.compute(q(7100), SHAPE))).toEqual([[34, 49]]);
    const drawn = p.compute(q(3000), SHAPE);
    expect(p.covers(drawn, q(2455))).toBe(true);
    expect(p.covers(drawn, q(3565))).toBe(true);
    expect(p.covers(drawn, q(2454))).toBe(false);
    expect(p.covers(drawn, q(3566))).toBe(false);
    // 검토 W-1(P-WIN-01·02) 을 실제 기하의 reset 으로
    const gw = g as IColumnGeometry & { reset(w: readonly number[], e: IExtraColumns, f: number): unknown };
    gw.reset(fill(50, 180), none, 2);
    expect(p.covers(drawn, q(3000))).toBe(false);
    const d2 = p.compute(q(3000), SHAPE);
    gw.reset(fill(60, 180), none, 2);
    expect(p.covers(d2, q(3000))).toBe(false);
    // 여분 컬럼(행번호 44)이 있는 실제 기하
    const withRowNo = ExtraColumns.fromOptions({ rowNumber: true });
    const g2 = new ColumnGeometry(fill(50, 180), withRowNo, 0);
    const p2 = new ColumnWindowPolicy(g2, ColumnWindowPolicy.defaultRules());
    const ex = withRowNo.width();
    const w2 = p2.compute(q(3000), SHAPE);
    expect(segs(w2)).toEqual([[Math.floor((2050 - ex) / 180), Math.min(49, Math.floor((5850 - ex) / 180))]]);
  });
});
