// @vitest-environment node
// 넓은 그리드 새 그물 — RangeRectCalculator 단위 시험(테스트 설계서 §2-5 U-RRC-01~09, 걸음 R1).
//
// 좌표 기준은 Q-13 답(§17-2 — `T0_FACTS.U-RRC-*`)대로 「지금 RangeSelectionManager.repaint 가 테두리에 쓰는 값」:
// 본문 상자(bodyWrap) 보이는 상자 기준, 머리글 높이를 안 더함. 그래서 headerHeight 인자에 0 을 넘긴 결과를 T0 값과 맞댄다.
// 높이는 셀 rect 로 잰 값 — 행 아래 테두리 1px 때문에 행 수 × rowHeight − 1(T0: 3행 × 32 → 95).
// 설계서 §2-5 표의 숫자(머리글 40 포함·높이 96)는 Q-13 답 전에 적은 가정이라 T0 값으로 바꿔 읽는다(로그 WARN 경우변경).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RangeRectCalculator } from '../../../src/core/coordinate/RangeRectCalculator.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { leafColIndex as L } from '../../../src/core/coordinate/types.js';
import type { CellRangeLike } from '../../../src/core/coordinate/geometryPorts.js';

const FACTS = JSON.parse(readFileSync(new URL('../__golden__/wg/T0_FACTS.json', import.meta.url), 'utf8'));
const facts: Record<string, any> = FACTS.facts ?? FACTS;
type Rect = { left: number; top: number; width: number; height: number };
const t0 = (id: string): Rect => facts[id].value.rectFromBodyWrap;
const t0Range = (id: string): CellRangeLike => { const r = facts[id].value.getActiveRange; return range(r.startRow, r.endRow, r.startCol, r.endCol); };
const t0Scroll = (id: string) => ({ top: 0, left: facts[id].value.scrollLeft as number });

const RH = 32;
/** 준비 R50: 50컬럼 × 120, extra rowNumber(44). */
function R50(frozen = 0) {
  return new ColumnGeometry(new Array(50).fill(120), ExtraColumns.fromOptions({ rowNumber: true }), frozen);
}
const range = (startRow: number, endRow: number, startCol: number, endCol: number) =>
  ({ startRow, endRow, startCol: L(startCol), endCol: L(endCol) });

describe('RangeRectCalculator — U-RRC (R1)', () => {
  it('U-RRC-01 rect 기본 = T0 사실(left 404 · top 64 · 360 × 95)', () => {
    const c = new RangeRectCalculator(R50());
    const got = c.rect(t0Range('U-RRC-01'), t0Scroll('U-RRC-01'), RH, 0);
    expect(got).toEqual(t0('U-RRC-01'));
    expect(got).toEqual({ left: 404, top: 64, width: 360, height: 95 });
    // headerHeight 인자는 top 에만 그대로 더해진다(설계서 표의 「머리글 40 포함」 기준이면 top 104)
    expect(c.rect(range(2, 4, 3, 5), { top: 0, left: 0 }, RH, 40)).toEqual({ left: 404, top: 104, width: 360, height: 95 });
  });

  it('U-RRC-02 스크롤 반영 — scroll {top:100, left:300} → left 104 · top −36, 폭·높이 그대로', () => {
    const c = new RangeRectCalculator(R50());
    expect(c.rect(range(2, 4, 3, 5), { top: 100, left: 300 }, RH, 0)).toEqual({ left: 104, top: -36, width: 360, height: 95 });
    expect(c.rect(range(2, 4, 3, 5), { top: 100, left: 300 }, RH, 40)).toEqual({ left: 104, top: 4, width: 360, height: 95 });
  });

  it('U-RRC-03 모서리가 창 밖 = T0 사실(left −2,956 · width 4,920, 자르지 않음)', () => {
    const g = R50();
    const got = new RangeRectCalculator(g).rect(t0Range('U-RRC-03'), t0Scroll('U-RRC-03'), RH, 0);
    expect(got).toEqual(t0('U-RRC-03'));
    expect(got.width).toBe(g.spanWidth(L(0), 41));
  });

  it('U-RRC-04 거꾸로 범위 = T0 사실(01 과 같은 rect)', () => {
    const c = new RangeRectCalculator(R50());
    const got = c.rect(t0Range('U-RRC-04'), t0Scroll('U-RRC-04'), RH, 0);
    expect(got).toEqual(t0('U-RRC-04'));
    expect(got).toEqual(c.rect(range(2, 4, 3, 5), { top: 0, left: 0 }, RH, 0));
  });

  it('U-RRC-05 한 칸 — left 44 · top 0 · 120 × 31', () => {
    const c = new RangeRectCalculator(R50());
    expect(c.rect(range(0, 0, 0, 0), { top: 0, left: 0 }, RH, 0)).toEqual({ left: 44, top: 0, width: 120, height: 31 });
    expect(c.rect(range(0, 0, 0, 0), { top: 0, left: 0 }, RH, 40)).toEqual({ left: 44, top: 40, width: 120, height: 31 });
  });

  it('U-RRC-06 고정 컬럼 안 범위 = T0 사실(left 44 — 고정은 가로 스크롤을 안 탐)', () => {
    const c = new RangeRectCalculator(R50(2));
    expect(c.rect(t0Range('U-RRC-06'), t0Scroll('U-RRC-06'), RH, 0)).toEqual(t0('U-RRC-06'));
  });

  it('U-RRC-07 고정 경계를 걸친 범위 = T0 사실(left −356 · width 640 — 지금은 두 모서리 칸의 합집합)', () => {
    const c = new RangeRectCalculator(R50(2));
    expect(c.rect(t0Range('U-RRC-07'), t0Scroll('U-RRC-07'), RH, 0)).toEqual(t0('U-RRC-07'));
  });

  it('U-RRC-08 기하가 바뀐 뒤 — resize(3,200) → width 440(캐시 없음)', () => {
    const g = R50();
    const c = new RangeRectCalculator(g);
    c.rect(range(2, 4, 3, 5), { top: 0, left: 0 }, RH, 0);
    g.resize(L(3), 200);
    expect(c.rect(range(2, 4, 3, 5), { top: 0, left: 0 }, RH, 0)).toEqual({ left: 404, top: 64, width: 440, height: 95 });
  });

  it('U-RRC-09 DOM 없이 — node 환경에서 위 전부 돎(document·window 없음)', () => {
    expect(typeof (globalThis as any).document).toBe('undefined');
    expect(typeof (globalThis as any).window).toBe('undefined');
    const c = new RangeRectCalculator(R50());
    expect(c.rect(range(2, 4, 3, 5), { top: 0, left: 0 }, RH, 0).width).toBe(360);
  });
});
