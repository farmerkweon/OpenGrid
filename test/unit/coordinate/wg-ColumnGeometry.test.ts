// @vitest-environment node
// 넓은 그리드 새 그물 — ColumnGeometry 단위 시험(테스트 설계서 §2-2 U-GEO-01~27 + §14 U-GEO-28, 걸음 R1).
import { describe, it, expect } from 'vitest';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { leafColIndex as L, px } from '../../../src/core/coordinate/types.js';
import { legacyFrozenLeft, legacyTotalColWidth } from '../wg-helpers/legacy-controls.js';

/** 씨앗 난수 — wg-helpers/random-ops.ts 의 mulberry32 와 같은 식(그 파일은 DOM 사슬을 끌어 node 환경에서 못 씀). */
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
const SEEDS = [20261121, 1, 2, 3, 42, 7777, 0xC0FFEE, 99991];

type Opts = { stateColumn?: boolean; draggable?: boolean; rowNumber?: boolean; checkColumn?: boolean; detailExpanderCol?: boolean };
function combo(mask: number): Opts {
  return {
    stateColumn: !!(mask & 1), draggable: !!(mask & 2), rowNumber: !!(mask & 4),
    checkColumn: !!(mask & 8), detailExpanderCol: !!(mask & 16),
  };
}
const ext0 = ExtraColumns.fromOptions({});
const ext80 = ExtraColumns.fromOptions({ rowNumber: true, checkColumn: true });
const ext44 = ExtraColumns.fromOptions({ rowNumber: true });
const G3 = () => new ColumnGeometry([100, 120, 80], ext0, 0);

/** 무작위 폭 — 1~2,000 정수 또는 .5 (이진 소수라 부분합이 정확). */
function randWidth(r: () => number): number {
  const n = 1 + Math.floor(r() * 2000);
  return r() < 0.5 ? n : n + 0.5;
}

describe('ColumnGeometry — U-GEO (R1)', () => {
  it('U-GEO-01 읽기 전부(G3)', () => {
    const g = G3();
    expect(g.count).toBe(3);
    expect(g.frozenCount).toBe(0);
    expect([0, 1, 2].map(i => g.widthOf(L(i)))).toEqual([100, 120, 80]);
    expect([0, 1, 2, 3].map(i => g.leftOf(L(i)))).toEqual([0, 100, 220, 300]);
    expect(g.totalWidth()).toBe(300);
    expect(g.frozenRight()).toBe(0);
    expect(g.extra).toBe(ext0);
  });

  it('U-GEO-02 여분 포함 left — extra 80', () => {
    const g = new ColumnGeometry([100, 120, 80], ext80, 0);
    expect(g.leftOf(L(0))).toBe(80);
    expect(g.leftOf(L(3))).toBe(380);
    expect(g.totalWidth()).toBe(380);
    expect(g.colAt(px(79))).toBe(0);
  });

  it('U-GEO-03 불변식 무작위 — 씨앗 8 × 1,000회', () => {
    for (const seed of SEEDS) {
      const r = mulberry32(seed);
      for (let k = 0; k < 1000; k++) {
        const count = 1 + Math.floor(r() * 200);
        const widths = Array.from({ length: count }, () => randWidth(r));
        const ext = ExtraColumns.fromOptions(combo(Math.floor(r() * 32)));
        const frozen = Math.floor(r() * (count + 1));
        const g = new ColumnGeometry(widths, ext, frozen);
        expect(g.leftOf(L(0))).toBe(ext.width());
        for (let i = 0; i < count; i++) {
          if (g.leftOf(L(i + 1)) - g.leftOf(L(i)) !== g.widthOf(L(i))) {
            throw new Error(`seed ${seed} k ${k} i ${i}`);
          }
        }
        expect(g.totalWidth()).toBe(g.leftOf(L(count)));
        expect(g.frozenRight()).toBe(g.leftOf(L(g.frozenCount)));
        expect(g.frozenCount).toBe(frozen);
      }
    }
  });

  it('U-GEO-04 spanWidth', () => {
    const g = G3();
    expect(g.spanWidth(L(1), 2)).toBe(200);
    expect(g.spanWidth(L(0), 3)).toBe(300);
    expect(g.spanWidth(L(2), 1)).toBe(g.widthOf(L(2)));
    expect(g.spanWidth(L(2), 1)).toBe(80);
  });

  it('U-GEO-05 spanWidth 끝 넘침 → 끝에서 자름', () => {
    expect(G3().spanWidth(L(2), 5)).toBe(80);
  });

  it('U-GEO-06 spanWidth(i,0) → 0', () => {
    const g = G3();
    expect(g.spanWidth(L(1), 0)).toBe(0);
    expect(g.spanWidth(L(0), -2)).toBe(0);
  });

  it('U-GEO-07 colAt 경계', () => {
    const g = G3();
    expect(g.colAt(px(0))).toBe(0);
    expect(g.colAt(px(99.999))).toBe(0);
    expect(g.colAt(px(100))).toBe(1);
    expect(g.colAt(px(219.5))).toBe(1);
    expect(g.colAt(px(220))).toBe(2);
    expect(g.colAt(px(-10))).toBe(0);
    expect(g.colAt(px(300))).toBe(2);
    expect(g.colAt(px(10000))).toBe(2);
  });

  // 검토 R4-1(총괄 판정): 다시 계산된 폭(생성자·reset)은 0 이상 유한하면 그대로 든다 — 걸음 전 화면이 폭 0 칸을 0px 로 그렸다
  // (남는 폭 없는 flex · 폭 0 컨테이너 · 사용자 width 0). 설계서의 옛 기대(Q-06 「reset 도 1 로 자름」)를 이 규칙으로 바꿈.
  it('U-GEO-08 폭 0 넣기 → reset·생성자는 0 그대로(0.5 도), 음수·NaN 은 0 · 이분 탐색은 끝남', () => {
    const g = G3();
    g.reset([0, 100], ext0, 0);
    expect(g.widthOf(L(0))).toBe(0);
    expect(g.leftOf(L(1))).toBe(0);
    expect(g.totalWidth()).toBe(100);
    expect(g.colAt(px(0))).toBe(1);   // 폭 0 컬럼의 오른쪽 경계 = 다음 컬럼
    expect(g.colAt(px(50))).toBe(1);
    expect(new ColumnGeometry([0, -5, 100, 0.5, NaN, Infinity], ext0, 0).widths()).toEqual([0, 0, 100, 0.5, 0, 0]);
    // 사용자 끌기 길(resize)에만 하한 1
    g.resize(L(1), 0);
    expect(g.widthOf(L(1))).toBe(1);
  });

  it('U-GEO-09 resize 변화 몫', () => {
    const g = G3();
    const v = g.version;
    const ch = g.resize(L(1), 150);
    expect(ch).toEqual({ none: false, widthCols: [1], leftFrom: 2, totalChanged: true, structural: false, version: v + 1 });
    expect(g.version).toBe(v + 1);
    expect(g.widthOf(L(1))).toBe(150);
    expect(g.leftOf(L(2))).toBe(250);
    expect(g.totalWidth()).toBe(330);
  });

  it('U-GEO-10 같은 폭 resize → none · version 그대로', () => {
    const g = G3();
    const v = g.version;
    const ch = g.resize(L(1), 120);
    expect(ch.none).toBe(true);
    expect(ch.widthCols).toEqual([]);
    expect(ch.version).toBe(v);
    expect(g.version).toBe(v);
  });

  it('U-GEO-11 1 미만 자르기', () => {
    for (const w of [0, -50, 0.4]) {
      const g = G3();
      g.resize(L(1), w);
      expect(g.widthOf(L(1))).toBe(1);
    }
  });

  it('U-GEO-12 숫자 아님 → none, 폭 그대로', () => {
    for (const w of [NaN, Infinity, -Infinity]) {
      const g = G3();
      const v = g.version;
      expect(g.resize(L(1), w).none).toBe(true);
      expect(g.widthOf(L(1))).toBe(120);
      expect(g.version).toBe(v);
    }
  });

  it('U-GEO-13 범위 밖 번호 → RangeError, 기하 그대로', () => {
    const g = G3();
    const v = g.version;
    expect(() => g.resize(L(-1), 100)).toThrow(RangeError);
    expect(() => g.resize(L(3), 100)).toThrow(RangeError);
    expect(() => g.resize(L(1.5), 100)).toThrow(RangeError);
    expect(g.count).toBe(3);
    expect(g.widths()).toEqual([100, 120, 80]);
    expect(g.version).toBe(v);
  });

  it('U-GEO-14 마지막 컬럼 resize → leftFrom = count · totalChanged', () => {
    const ch = G3().resize(L(2), 90);
    expect(ch.leftFrom).toBe(3);
    expect(ch.totalChanged).toBe(true);
    expect(ch.widthCols).toEqual([2]);
  });

  it('U-GEO-15 같은 값 reset → none, version 그대로', () => {
    const g = G3();
    const v = g.version;
    const ch = g.reset([100, 120, 80], ext0, 0);
    expect(ch.none).toBe(true);
    expect(g.version).toBe(v);
    // 같은 값의 다른 인스턴스 extra 도 같은 것으로 본다
    const g2 = new ColumnGeometry([1, 2], ext44, 0);
    expect(g2.reset([1, 2], ExtraColumns.fromOptions({ rowNumber: true }), 0).none).toBe(true);
  });

  it('U-GEO-16 컬럼 수 바뀜 → structural, count 2', () => {
    const g = G3();
    const ch = g.reset([100, 120], ext0, 0);
    expect(ch.structural).toBe(true);
    expect(ch.none).toBe(false);
    expect(g.count).toBe(2);
    expect(g.totalWidth()).toBe(220);
  });

  it('U-GEO-17 고정 수 바뀜 → structural, frozenRight 220', () => {
    const g = G3();
    const ch = g.reset([100, 120, 80], ext0, 2);
    expect(ch.structural).toBe(true);
    expect(g.frozenRight()).toBe(220);
  });

  it('U-GEO-18 여분 바뀜 → structural, leftOf 전부 +44', () => {
    const g = G3();
    const before = [0, 1, 2, 3].map(i => g.leftOf(L(i)));
    const ch = g.reset([100, 120, 80], ext44, 0);
    expect(ch.structural).toBe(true);
    expect([0, 1, 2, 3].map(i => g.leftOf(L(i)))).toEqual(before.map(x => x + 44));
    expect(g.extra).toBe(ext44);
  });

  it('U-GEO-19 widths() 최신', () => {
    const g = G3();
    g.resize(L(1), 150);
    expect(g.widths()).toEqual([100, 150, 80]);
  });

  it('U-GEO-20 입력 배열 별칭 — 바깥 배열을 고쳐도 기하 그대로', () => {
    const w = [100, 120, 80];
    const g = new ColumnGeometry(w, ext0, 0);
    w[0] = 999;
    expect(g.widthOf(L(0))).toBe(100);
    const w2 = [5, 6];
    g.reset(w2, ext0, 0);
    w2[1] = 999;
    expect(g.widthOf(L(1))).toBe(6);
  });

  it('U-GEO-21 고정 오른쪽 끝 — extra 80, frozen 2 → 300', () => {
    expect(new ColumnGeometry([100, 120, 80], ext80, 2).frozenRight()).toBe(300);
  });

  it('U-GEO-22 컬럼 0개', () => {
    const g = new ColumnGeometry([], ext44, 0);
    expect(g.count).toBe(0);
    expect(g.totalWidth()).toBe(44);
    expect(g.leftOf(L(0))).toBe(44);
    expect(g.colAt(px(10))).toBe(0);
    expect(g.frozenRight()).toBe(44);
    expect(g.spanWidth(L(0), 3)).toBe(0);
  });

  it('U-GEO-23 판 번호 — none:false 일 때만 +1, 단조 증가 (씨앗 8 × 100)', () => {
    for (const seed of SEEDS) {
      const r = mulberry32(seed);
      const g = new ColumnGeometry([100, 120, 80, 60], ext0, 0);
      let last = g.version;
      for (let k = 0; k < 100; k++) {
        let ch;
        const pick = r();
        if (pick < 0.6) {
          const ci = Math.floor(r() * g.count);
          const w = r() < 0.3 ? g.widthOf(L(ci)) : Math.floor(r() * 300);
          ch = g.resize(L(ci), w);
        } else {
          const n = r() < 0.7 ? g.count : 1 + Math.floor(r() * 6);
          const ws = r() < 0.3 && n === g.count ? [...g.widths()] : Array.from({ length: n }, () => 1 + Math.floor(r() * 200));
          ch = g.reset(ws, ExtraColumns.fromOptions(combo(r() < 0.7 ? 0 : Math.floor(r() * 32))), Math.floor(r() * (n + 1)));
        }
        if (ch.none) expect(g.version).toBe(last);
        else expect(g.version).toBe(last + 1);
        expect(ch.version).toBe(g.version);
        last = g.version;
      }
    }
  });

  it('U-GEO-24 대조 — 옛 고정 left 4벌(사본)과 같음 (씨앗 8 × 500)', () => {
    for (const seed of SEEDS) {
      const r = mulberry32(seed);
      for (let k = 0; k < 500; k++) {
        const count = 1 + Math.floor(r() * 30);
        const widths = Array.from({ length: count }, () => randWidth(r));
        const o = combo(Math.floor(r() * 32));
        const frozen = Math.floor(r() * (count + 1));
        const g = new ColumnGeometry(widths, ExtraColumns.fromOptions(o), frozen);
        const detail = !!o.detailExpanderCol;
        // 머리글 고정 leftOff · 본문 고정 frozenLeftOff · 세로 병합 leftOff · 여분 누적 — 넷이 같은 식(사본 하나)
        for (let i = 0; i < frozen; i++) {
          expect(g.leftOf(L(i))).toBe(legacyFrozenLeft(widths, o, detail, i));
        }
        expect(g.totalWidth()).toBe(legacyTotalColWidth(widths, count, o, detail));
      }
    }
  });

  it('U-GEO-25 큰 컬럼 수 — 10,000 × 50, resize(0,80) → leftOf(9999) 499,980', () => {
    const g = new ColumnGeometry(new Array(10000).fill(50), ext0, 0);
    g.resize(L(0), 80);
    expect(g.leftOf(L(9999))).toBe(30 + 9999 * 50);
    expect(g.leftOf(L(9999))).toBe(499980);
    expect(g.totalWidth()).toBe(500030);
  });

  it('U-GEO-26 고정 안/밖 resize — frozenRight 는 고정 안에서만 바뀜', () => {
    const g = new ColumnGeometry([100, 120, 80, 60], ext0, 2);
    expect(g.frozenRight()).toBe(220);
    g.resize(L(1), 150);
    expect(g.frozenRight()).toBe(250);
    g.resize(L(2), 300);
    expect(g.frozenRight()).toBe(250);
  });

  it('U-GEO-27 변화 몫 불변 — 반환값·widthCols frozen', () => {
    const g = G3();
    for (const ch of [g.resize(L(1), 150), g.resize(L(1), 150), g.reset([1, 2], ext0, 0), g.changesSince(0)]) {
      expect(Object.isFrozen(ch)).toBe(true);
      expect(Object.isFrozen(ch.widthCols)).toBe(true);
    }
    expect(Object.isFrozen(g.widths())).toBe(true);
  });

  it('U-GEO-29 반올림의 주인 — resize 는 정수 px 로 듦 · 생성자·reset 의 소수는 그대로 (검토 X-3, 총괄 결정)', () => {
    const g = new ColumnGeometry([100.5, 120.25, 80], ext0, 0);
    expect(g.widths()).toEqual([100.5, 120.25, 80]);          // 생성자 소수 그대로
    g.resize(L(1), 150.6);
    expect(g.widthOf(L(1))).toBe(151);
    g.resize(L(1), 180.5);                                     // Math.round 는 .5 를 올림
    expect(g.widthOf(L(1))).toBe(181);
    expect(g.leftOf(L(2))).toBe(100.5 + 181);
    const v = g.version;
    expect(g.resize(L(1), 181.4).none).toBe(true);            // 반올림하면 같은 폭 → 판 그대로
    expect(g.version).toBe(v);
    g.reset([33.3, 66.6, 99.9], ext0, 0);
    expect(g.widths()).toEqual([33.3, 66.6, 99.9]);          // reset 소수 그대로
  });

  it('U-GEO-30 이상한 번호·아주 큰 폭 방어 (검토 G-5)', () => {
    const g = G3();
    expect(g.widthOf(L(NaN))).toBe(0);
    expect(g.widthOf(L(1.5))).toBe(0);
    expect(g.leftOf(L(NaN))).toBe(g.leftOf(L(0)));
    expect(g.spanWidth(L(NaN), 2)).toBe(0);
    // 상한 1e15(검토 R4-4 — 2e7 같은 큰 폭은 걸음 전처럼 그대로, 합이 Infinity 가 될 값만 자름)
    expect(new ColumnGeometry([2e7, 10], ext0, 0).widthOf(L(0))).toBe(2e7);
    const big = new ColumnGeometry([1e308, 1e308, 50], ext0, 0);
    expect(Number.isFinite(big.totalWidth())).toBe(true);
    for (let i = 0; i < 3; i++) expect(big.leftOf(L(i + 1)) - big.leftOf(L(i))).toBe(big.widthOf(L(i)));
    expect(big.widthOf(L(0))).toBe(1e15);
    big.resize(L(2), 1e300);
    expect(big.widthOf(L(2))).toBe(1e15);
  });

  it('U-GEO-28 changesSince — resize 3번의 합 · 같은 판 none · reset 끼면 structural', () => {
    const g = new ColumnGeometry([100, 120, 80, 60, 40], ext0, 0);
    const v0 = g.version;
    g.resize(L(3), 70);
    g.resize(L(1), 130);
    g.resize(L(3), 75);
    const ch = g.changesSince(v0);
    expect(ch.none).toBe(false);
    expect(ch.widthCols).toEqual([1, 3]);
    expect(ch.leftFrom).toBe(2);
    expect(ch.totalChanged).toBe(true);
    expect(ch.structural).toBe(false);
    expect(ch.version).toBe(g.version);
    // 중간 판부터
    expect(g.changesSince(v0 + 2).widthCols).toEqual([3]);
    expect(g.changesSince(v0 + 2).leftFrom).toBe(4);
    // 같은 판
    const same = g.changesSince(g.version);
    expect(same.none).toBe(true);
    expect(same.widthCols).toEqual([]);
    expect(same.version).toBe(g.version);
    // reset(폭만 바뀜, 구조 같음)
    const v1 = g.version;
    g.reset([100, 130, 80, 75, 50], ext0, 0);
    const r1 = g.changesSince(v1);
    expect(r1.structural).toBe(false);
    expect(r1.widthCols).toEqual([4]);
    // reset 이 낀 구간(구조 변경)
    const v2 = g.version;
    g.resize(L(0), 99);
    g.reset([100, 120], ext0, 0);
    g.resize(L(1), 50);
    expect(g.changesSince(v2).structural).toBe(true);
    expect(g.changesSince(v0).structural).toBe(true);
    // 모르는 판(앞날·아주 옛날) → 처음부터 다시 깔도록 structural
    expect(g.changesSince(g.version + 5).structural).toBe(true);
  });
});
