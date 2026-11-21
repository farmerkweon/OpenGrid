// @vitest-environment node
/**
 * 넓은 그리드 새 그물 — RenderRequest · Change 단위 시험. 테스트 설계서 §2-7 U-REQ-01~16 + §14 U-REQ-17 + §17-11 U-REQ-18.
 * merge 두 갈래(설계 §14 Q-15): 교환·결합 = changes·cells·widthChangedFrom·sync / 나중이 이김 = rows·focusTo(null 은 못 이김).
 */
import { describe, it, expect, vi } from 'vitest';
import { RenderRequest } from '../../../../src/core/domain/render/RenderRequest.js';
import { Change, type CellKey, type CellPos, type ExplicitRows, type IRenderRequest } from '../../../../src/core/domain/render/ports.js';
import type { ViewIndex } from '../../../../src/core/coordinate/types.js';

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

const BITS = Object.entries(Change).filter(([k]) => k !== 'All').map(([, v]) => v);
const FIELDS = ['a', 'b', 'c', 'd'];

/** 교환·결합 갈래만 뽑음(rows·focusTo 는 「나중이 이김」이라 교환 법칙 밖). */
const commutative = (r: IRenderRequest) => ({
  changes: r.changes,
  cells: r.detail.cells,
  widthChangedFrom: r.detail.widthChangedFrom,
  sync: r.detail.sync,
});

function randomReq(rnd: () => number): RenderRequest {
  let mask = 0;
  for (const b of BITS) if (rnd() < 0.3) mask |= b;
  const nCells = Math.floor(rnd() * 6);
  const cells: CellKey[] = [];
  for (let i = 0; i < nCells; i++) cells.push({ ri: Math.floor(rnd() * 4), field: FIELDS[Math.floor(rnd() * 4)]! });
  const wcf = rnd() < 0.4 ? null : Math.floor(rnd() * 10);
  return RenderRequest.of(mask, { cells, widthChangedFrom: wcf, sync: rnd() < 0.3 });
}

const span = (s: number, e: number): ExplicitRows => ({ start: s as ViewIndex, end: e as ViewIndex });
const pos = (ri: number, ci: number): CellPos => ({ ri, ci });

describe('RenderRequest — U-REQ-01~18', () => {
  it('U-REQ-01 NONE', () => {
    const n = RenderRequest.NONE;
    expect(n.changes).toBe(0);
    for (const b of BITS) expect(n.has(b)).toBe(false);
    expect(n.detail.sync).toBe(false);
    expect(n.detail.rows).toBeNull();
    expect(n.detail.focusTo).toBeNull();
    expect(n.detail.widthChangedFrom).toBeNull();
    expect(n.detail.cells).toEqual([]);
  });

  it('U-REQ-02 of(ColWidth)', () => {
    const r = RenderRequest.of(Change.ColWidth);
    expect(r.has(Change.ColWidth)).toBe(true);
    expect(r.has(Change.RowSet)).toBe(false);
  });

  it('U-REQ-03 합치기 교환 법칙(changes·cells·widthChangedFrom·sync) — 씨앗 8 × 1,000쌍', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rnd = mulberry32(seed);
      for (let k = 0; k < 1000; k++) {
        const a = randomReq(rnd);
        const b = randomReq(rnd);
        expect(commutative(a.merge(b))).toEqual(commutative(b.merge(a)));
      }
    }
  });

  it('U-REQ-04 결합 법칙 — 씨앗 8 × 1,000 셋', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rnd = mulberry32(100 + seed);
      for (let k = 0; k < 1000; k++) {
        const a = randomReq(rnd);
        const b = randomReq(rnd);
        const c = randomReq(rnd);
        // rows·focusTo 도 「나중이 이김」은 결합 법칙을 지킨다 — 통째로 비교
        const ab = a.merge(b).merge(c);
        const bc = a.merge(b.merge(c));
        expect({ changes: ab.changes, detail: ab.detail }).toEqual({ changes: bc.changes, detail: bc.detail });
      }
    }
  });

  it('U-REQ-05 항등원 NONE', () => {
    const rnd = mulberry32(7);
    for (let k = 0; k < 200; k++) {
      const a = randomReq(rnd);
      const x = a.merge(RenderRequest.NONE);
      const y = RenderRequest.NONE.merge(a);
      expect({ c: x.changes, d: x.detail }).toEqual({ c: a.changes, d: a.detail });
      expect({ c: y.changes, d: y.detail }).toEqual({ c: a.changes, d: a.detail });
    }
  });

  it('U-REQ-06 같은 것 합치기 — cells 중복 없음', () => {
    const rnd = mulberry32(9);
    for (let k = 0; k < 200; k++) {
      const a = randomReq(rnd);
      const aa = a.merge(a);
      expect({ c: aa.changes, d: aa.detail }).toEqual({ c: a.changes, d: a.detail });
      const keys = aa.detail.cells.map((x) => `${x.ri}|${x.field}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('U-REQ-07 sync 는 OR', () => {
    const a = RenderRequest.of(Change.RowSet, { sync: false });
    const b = RenderRequest.of(Change.RowSet, { sync: true });
    expect(a.merge(b).detail.sync).toBe(true);
    expect(b.merge(a).detail.sync).toBe(true);
    expect(a.merge(a).detail.sync).toBe(false);
  });

  it('U-REQ-08 cells 합집합(순서 무관)', () => {
    const r = RenderRequest.of(Change.CellValue, { cells: [{ ri: 1, field: 'a' }] })
      .merge(RenderRequest.of(Change.CellValue, { cells: [{ ri: 2, field: 'b' }] }))
      .merge(RenderRequest.of(Change.CellValue, { cells: [{ ri: 1, field: 'a' }] }));
    expect(r.detail.cells.length).toBe(2);
    expect(new Set(r.detail.cells.map((c) => `${c.ri}|${c.field}`))).toEqual(new Set(['1|a', '2|b']));
  });

  it('U-REQ-09 focus 두 번 — 나중 요청이 이김, null 은 못 이김', () => {
    const a = RenderRequest.of(Change.Focus, { focusTo: pos(0, 1) });
    const b = RenderRequest.of(Change.Focus, { focusTo: pos(0, 2) });
    expect(a.merge(b).detail.focusTo).toEqual(pos(0, 2));
    expect(b.merge(a).detail.focusTo).toEqual(pos(0, 1));
    expect(a.merge(RenderRequest.NONE).detail.focusTo).toEqual(pos(0, 1));
    // 옛 칸은 요청에 없다(플래너가 drawn.focus 에서) — 세부에 from 칸이 없음
    expect(Object.keys(a.detail).sort()).toEqual(['cells', 'focusTo', 'rows', 'sync', 'widthChangedFrom']);
  });

  it('U-REQ-10 widthChangedFrom 은 작은 쪽', () => {
    const r5 = RenderRequest.of(Change.ColWidth, { widthChangedFrom: 5 });
    const r2 = RenderRequest.of(Change.ColWidth, { widthChangedFrom: 2 });
    const r3 = RenderRequest.of(Change.ColWidth, { widthChangedFrom: 3 });
    const rn = RenderRequest.of(Change.ColWidth, { widthChangedFrom: null });
    expect(r5.merge(r2).detail.widthChangedFrom).toBe(2);
    expect(r2.merge(r5).detail.widthChangedFrom).toBe(2);
    expect(rn.merge(r3).detail.widthChangedFrom).toBe(3);
    expect(r3.merge(rn).detail.widthChangedFrom).toBe(3);
  });

  it('U-REQ-11 불변', () => {
    const r = RenderRequest.of(Change.CellValue, { cells: [{ ri: 1, field: 'a' }], rows: span(0, 10), focusTo: pos(1, 1) });
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.detail)).toBe(true);
    expect(Object.isFrozen(r.detail.cells)).toBe(true);
    for (const c of r.detail.cells) expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(r.detail.rows)).toBe(true);
    expect(Object.isFrozen(r.detail.focusTo)).toBe(true);
    // 넘겨준 배열을 나중에 고쳐도 요청은 그대로
    const src: CellKey[] = [{ ri: 1, field: 'a' }];
    const r2 = RenderRequest.of(Change.CellValue, { cells: src });
    src.push({ ri: 9, field: 'z' });
    expect(r2.detail.cells.length).toBe(1);
    expect(Object.isFrozen(RenderRequest.NONE)).toBe(true);
  });

  it('U-REQ-12 All', () => {
    expect(Change.All).toBe(8191);
    expect(Change.All).toBe((1 << 13) - 1);
    const all = RenderRequest.of(Change.All);
    for (const b of BITS) expect(all.has(b)).toBe(true);
  });

  it('U-REQ-13 비트 표', () => {
    expect(BITS.length).toBe(13);
    for (const b of BITS) expect(b > 0 && (b & (b - 1)) === 0).toBe(true);
    expect(new Set(BITS).size).toBe(13);
    expect(BITS.reduce((m, b) => m | b, 0)).toBe(Change.All);
  });

  it('U-REQ-14 여러 비트 has 는 「하나라도」', () => {
    const r = RenderRequest.of(Change.ColWidth);
    expect(r.has(Change.ColWidth | Change.RowSet)).toBe(true);
    expect(r.has(Change.RowSet | Change.Focus)).toBe(false);
    expect(r.has(0)).toBe(false);
  });

  it('U-REQ-15 of(0) — 일 없음', () => {
    const r = RenderRequest.of(0);
    expect(r.changes).toBe(0);
    for (const b of BITS) expect(r.has(b)).toBe(false);
  });

  it('U-REQ-16 범위 밖 비트 → RangeError', () => {
    expect(() => RenderRequest.of(1 << 20)).toThrow(RangeError);
    expect(() => RenderRequest.of(-1)).toThrow(RangeError);
    expect(() => RenderRequest.of(1.5)).toThrow(RangeError);
    expect(() => RenderRequest.of(Number.NaN)).toThrow(RangeError);
  });

  it('U-REQ-17 rows 합치기 — null 아닌 쪽, 둘 다면 뒤 요청', () => {
    const R = span(0, 100);
    const R1 = span(0, 10);
    const R2 = span(5, 20);
    const n = RenderRequest.of(Change.All);
    const r = RenderRequest.of(Change.All, { rows: R });
    expect(n.merge(r).detail.rows).toEqual(R);
    expect(r.merge(n).detail.rows).toEqual(R);
    expect(RenderRequest.of(Change.All, { rows: R1 }).merge(RenderRequest.of(Change.All, { rows: R2 })).detail.rows).toEqual(R2);
    expect(RenderRequest.of(Change.All, { rows: R2 }).merge(RenderRequest.of(Change.All, { rows: R1 })).detail.rows).toEqual(R1);
    const c = RenderRequest.of(Change.All, { rows: 'clear' });
    expect(r.merge(c).detail.rows).toBe('clear');
    expect(c.merge(r).detail.rows).toEqual(R);
    expect(c.merge(n).detail.rows).toBe('clear');
  });

  it('검토 T-7 merge 는 칸 배열을 다시 정렬하지 않음(정렬 호출 0) · 한쪽이 비면 같은 배열 그대로', () => {
    const a = RenderRequest.of(Change.CellValue, { cells: [{ ri: 1, field: 'x' }, { ri: 0, field: 'y' }, { ri: 5, field: 'a' }] });
    const b = RenderRequest.of(Change.CellValue, { cells: [{ ri: 3, field: 'q' }, { ri: 1, field: 'x' }, { ri: 0, field: 'z' }] });
    const scroll = RenderRequest.of(Change.RowsScrolled);
    const spy = vi.spyOn(Array.prototype, 'sort');
    try {
      const m = a.merge(b);
      const m2 = a.merge(scroll);
      const m3 = scroll.merge(b);
      expect(spy).toHaveBeenCalledTimes(0);
      expect(m.detail.cells.map((c) => `${c.ri}|${c.field}`)).toEqual(['0|y', '0|z', '1|x', '3|q', '5|a']);
      expect(Object.isFrozen(m.detail.cells)).toBe(true);
      expect(m2.detail.cells).toBe(a.detail.cells);
      expect(m3.detail.cells).toBe(b.detail.cells);
      // 1칸 요청 2,000개를 차례로 합쳐도 정렬은 0번이고 결과는 정규형(오름차순·중복 없음)
      let acc = RenderRequest.NONE;
      const singles = Array.from({ length: 2000 }, (_, i) => RenderRequest.of(Change.CellValue, { cells: [{ ri: (i * 7919) % 1000, field: 'f' }] }));
      spy.mockClear();
      for (const s of singles) acc = acc.merge(s);
      expect(spy).toHaveBeenCalledTimes(0);
      expect(acc.detail.cells.map((c) => c.ri)).toEqual(Array.from({ length: 1000 }, (_, i) => i));
    } finally {
      spy.mockRestore();
    }
  });

  it('U-REQ-18 focusTo null 은 못 이김 · widthChangedFrom 작은 쪽(교환)', () => {
    const fn = RenderRequest.of(Change.Focus, { focusTo: null });
    const f2 = RenderRequest.of(Change.Focus, { focusTo: pos(0, 2) });
    expect(fn.merge(f2).detail.focusTo).toEqual(pos(0, 2));
    expect(f2.merge(fn).detail.focusTo).toEqual(pos(0, 2));
    const w5 = RenderRequest.of(Change.ColWidth, { widthChangedFrom: 5 });
    const w2 = RenderRequest.of(Change.ColWidth, { widthChangedFrom: 2 });
    expect(w5.merge(w2).detail.widthChangedFrom).toBe(2);
    expect(w2.merge(w5).detail.widthChangedFrom).toBe(2);
  });
});

describe('RenderRequest — R5678 검토 반영(F-08 공용 값 · F-03 합치기 주인 하나)', () => {
  it('F-08 REPAINT_VISIBLE · REPAINT_CLEAR 는 나눠 쓰는 얼린 값 하나, rowsInclusive 는 끝 포함 → 반열림(자르지 않음)', async () => {
    const { RenderRequest: R } = await import('../../../../src/core/domain/render/RenderRequest.js');
    expect(R.REPAINT_VISIBLE).toBe(R.REPAINT_VISIBLE);
    expect({ c: R.REPAINT_VISIBLE.changes, d: R.REPAINT_VISIBLE.detail }).toEqual({ c: Change.All, d: RenderRequest.of(Change.All, { sync: true }).detail });
    expect(R.REPAINT_CLEAR.detail.rows).toBe('clear');
    expect(R.REPAINT_CLEAR.detail.sync).toBe(true);
    expect(Object.isFrozen(R.REPAINT_VISIBLE) && Object.isFrozen(R.REPAINT_CLEAR)).toBe(true);
    expect(R.rowsInclusive(40, 69).detail.rows).toEqual({ start: 40, end: 70 });
    expect(R.rowsInclusive(0, -1).detail.rows).toEqual({ start: 0, end: 0 });
    expect(R.rowsInclusive(9, -1).detail.rows).toEqual({ start: 9, end: 0 });
    expect(R.rowsInclusive(0, 4).changes).toBe(Change.All);
    expect(R.rowsInclusive(0, 4).detail.sync).toBe(true);
  });

  it('F-03 누적기 — merge 와 같은 규칙, 많은 칸은 더하기마다 새 배열 없이 얼릴 때 한 번 정렬', async () => {
    const { RenderRequestAccumulator } = await import('../../../../src/core/domain/render/RenderRequest.js');
    const rnd = mulberry32(77);
    for (let k = 0; k < 300; k++) {
      const reqs = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => randomReq(rnd));
      const acc = new RenderRequestAccumulator();
      for (const r of reqs) acc.add(r);
      const viaAcc = acc.freeze();
      const viaMerge = reqs.reduce((m, r) => m.merge(r), RenderRequest.NONE);
      expect({ c: viaAcc.changes, d: viaAcc.detail }).toEqual({ c: viaMerge.changes, d: viaMerge.detail });
      expect(acc.pending).toBe(false);
    }
    // 칸 5,000 개 요청을 한 누적기에 — 정렬은 얼릴 때 한 번
    const acc = new RenderRequestAccumulator();
    const singles = Array.from({ length: 5000 }, (_, i) => RenderRequest.of(Change.CellValue, { cells: [{ ri: (i * 7919) % 5000, field: 'f' }] }));
    const spy = vi.spyOn(Array.prototype, 'sort');
    try {
      for (const s of singles) acc.add(s);
      expect(spy).toHaveBeenCalledTimes(0);
      const out = acc.freeze();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(out.detail.cells.length).toBe(5000);
      expect(out.detail.cells[0]!.ri).toBe(0);
    } finally {
      spy.mockRestore();
    }
    // 비운 뒤 얼리면 빈 요청
    const empty = new RenderRequestAccumulator();
    expect(empty.pending).toBe(false);
    expect(empty.freeze().changes).toBe(0);
    // 비트 0 요청도 「있음」
    expect(new RenderRequestAccumulator().add(RenderRequest.NONE).pending).toBe(true);
  });
});
