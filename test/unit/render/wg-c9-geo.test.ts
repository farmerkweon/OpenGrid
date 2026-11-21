// @vitest-environment node
// 넓은 그리드 새 그물 — 걸음 C9 의 GEO 몫(테스트 설계서 §2-37 U-HRV-01~06 · §2-24 U-GP-11 · 빈칸 투영).
// HorizontalReveal 은 기하·스크롤 상자 값만 읽는다(DOM 0) — node 환경에서 돈다는 것이 그 증거(U-HRV-06).
import { describe, it, expect } from 'vitest';
import { HorizontalReveal, type RevealScroll } from '../../../src/core/render/HorizontalReveal.js';
import { GeometryApplier } from '../../../src/core/render/GeometryApplier.js';
import { CellRegistry } from '../../../src/core/render/body/CellRegistry.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { leafColIndex as L } from '../../../src/core/coordinate/types.js';

const ext0 = ExtraColumns.fromOptions({});
function scrollAt(scrollLeft: number, width = 1200) {
  const writes: number[] = [];
  const s: RevealScroll & { writes: number[] } = {
    box: { scrollLeft, width },
    scrollLeftTo(x: number) { writes.push(x); (this as any).box = { scrollLeft: x, width }; },
    writes,
  };
  return s;
}
const g50 = (frozen = 0) => new ColumnGeometry(new Array(50).fill(120), ext0, frozen);

describe('HorizontalReveal — U-HRV (C9)', () => {
  it('U-HRV-01 이미 보임 — 컬럼 5(600~720), scrollLeft 0, 폭 1,200 → 쓰기 0', () => {
    const s = scrollAt(0);
    expect(new HorizontalReveal(s, g50()).reveal(5)).toBeNull();
    expect(s.writes).toEqual([]);
  });

  it('U-HRV-02 오른쪽 밖 — 컬럼 20(2,400~2,520) → scrollLeft 1,320', () => {
    const s = scrollAt(0);
    expect(new HorizontalReveal(s, g50()).reveal(20)).toBe(1320);
    expect(s.writes).toEqual([1320]);
  });

  it('U-HRV-03 고정 뒤에 숨음 — frozen 2(240), scrollLeft 1,000, 컬럼 9(1,080~1,200) → 840', () => {
    const s = scrollAt(1000);
    expect(new HorizontalReveal(s, g50(2)).reveal(9)).toBe(840);
  });

  it('U-HRV-04 고정 컬럼 — 쓰기 0', () => {
    const s = scrollAt(1000);
    expect(new HorizontalReveal(s, g50(2)).reveal(0)).toBeNull();
    expect(s.writes).toEqual([]);
  });

  it('U-HRV-05 화면보다 넓은 컬럼(3,000) — 왼쪽 끝 맞춤', () => {
    const g = new ColumnGeometry([120, 120, 3000, 120], ext0, 0);
    const s = scrollAt(0);
    expect(new HorizontalReveal(s, g).reveal(2)).toBe(240);
    // 이미 왼쪽 끝이 맞으면 그대로
    const t = scrollAt(240);
    expect(new HorizontalReveal(t, g).reveal(2)).toBeNull();
  });

  it('U-HRV-06 DOM 안 읽음 — node 환경(document 없음)에서 기하·상자만으로 같은 값 · 여분 컬럼·고정 여분도 셈', () => {
    expect(typeof (globalThis as any).document).toBe('undefined');
    const g = new ColumnGeometry(new Array(50).fill(120), ExtraColumns.fromOptions({ rowNumber: true }), 2);
    // 고정 2 + 여분 44 → 가리는 폭 284. 컬럼 9 왼쪽 = 44 + 1,080 = 1,124 → 1,124 − 284 = 840
    expect(new HorizontalReveal(scrollAt(1000), g).reveal(9)).toBe(840);
    // 고정이 없으면 여분 칸은 같이 스크롤 — 가리는 폭 0
    const h = new ColumnGeometry(new Array(50).fill(120), ExtraColumns.fromOptions({ rowNumber: true }), 0);
    expect(new HorizontalReveal(scrollAt(0), h).reveal(20)).toBe(44 + 2520 - 1200);
  });

  it('C9-HRV-a 경계 — 끝을 넘지 않음 · 폭 모름(0) · 범위 밖 번호 → null', () => {
    expect(new HorizontalReveal(scrollAt(0), g50()).reveal(49)).toBe(50 * 120 - 1200);
    expect(new HorizontalReveal(scrollAt(0, 0), g50()).reveal(20)).toBeNull();
    expect(new HorizontalReveal(scrollAt(0), g50()).reveal(50)).toBeNull();
    expect(new HorizontalReveal(scrollAt(0), g50()).reveal(-1)).toBeNull();
  });
});

describe('빈칸 투영 — U-GP-11 (C9)', () => {
  const fake = (w: number) => { const style: Record<string, string> = { width: `${w}px` }; return { style, isConnected: true } as unknown as HTMLElement; };
  it('U-GP-11 창 [11,32] — 왼쪽 빈칸(0~10)·오른쪽(33~49), 컬럼 5 +100 → 왼쪽 +100, 오른쪽 그대로', () => {
    const g = g50();
    const a = new GeometryApplier(g, new CellRegistry());
    const left = fake(11 * 120), right = fake(17 * 120);
    a.trackGap(left, 0, 10, 'body');
    a.trackGap(right, 33, 49, 'body');
    a.applyChange(g.resize(L(5), 220));
    expect(left.style.width).toBe(`${11 * 120 + 100}px`);
    expect(right.style.width).toBe(`${17 * 120}px`);
  });

  it('C9-GP-a 창 밖 오른쪽 컬럼 폭 바뀜 — 오른쪽 빈칸만 · 창이 옮겨 빈칸 구간이 바뀌면 다시 등록한 구간으로(같은 요소 갈아 끼움)', () => {
    const g = g50();
    const a = new GeometryApplier(g, new CellRegistry());
    const right = fake(17 * 120);
    a.trackGap(right, 33, 49, 'body');
    a.applyChange(g.resize(L(40), 60));
    expect(right.style.width).toBe(`${17 * 120 - 60}px`);
    a.trackGap(right, 35, 49, 'body');            // 창이 [11,34] 로 넓어짐 — 같은 요소, 새 구간
    expect(a.trackedCount('body')).toBe(1);
    a.applyChange(g.resize(L(33), 10));           // 이제 창 안 컬럼 — 빈칸 값 안 바뀜(구간 밖)
    expect(right.style.width).toBe(`${17 * 120 - 60}px`);
    expect(a.projections('body')[0]!.value).toBe(`${15 * 120 - 60}px`);   // 등록 값 = 새 구간 합(다음 반영 때 씀)
  });
});
