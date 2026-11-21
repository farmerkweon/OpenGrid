// @vitest-environment jsdom
// 넓은 그리드 새 그물 — 걸음 C8(EDGE 몫): 푸터 폭 자리를 GeometryApplier 'footer' 범위로 등록.
// 판정: 한 컬럼 폭을 바꿔 applyChange 만 한 푸터 DOM == 그 폭으로 처음부터 그린 푸터 DOM(바이트) — 칸·colspan 칸·채움 칸·여분 칸.
// 디테일 켠 화면의 알려진 −28px(H-4)은 그대로(끌어도 유지). 다시 그리면 옛 등록을 푼다(release('footer')).
import { describe, it, expect } from 'vitest';
import { FooterView } from '../../../src/core/render/FooterView.js';
import { GeometryApplier } from '../../../src/core/render/GeometryApplier.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { leafColIndex as L } from '../../../src/core/coordinate/types.js';

const NO_CELLS = { cellsOfColumn: () => [] as HTMLElement[] } as any;
const LEAVES = Array.from({ length: 6 }, (_, i) => ({ field: 'c' + i, type: i === 2 ? 'number' : undefined }));
const VALUES = [{ _field: 'c2', _value: 10, _formatted: '10' }, { _field: 'c4', _value: 7, _formatted: '7' }];

interface Scene { widths: number[]; extra: any; defs: any[] }
/** 장면 하나를 기하·등록기·뷰로 그린다. stored = 저장 폭 배열(값이 있나만 봄). */
function draw(sc: Scene, stored: (number | null)[] = sc.widths, applier = true) {
  const geo = new ColumnGeometry(sc.widths, ExtraColumns.fromOptions(sc.extra), 0);
  const ap = new GeometryApplier(geo, NO_CELLS);
  const c = document.createElement('div');
  document.body.appendChild(c); // applyChange 는 떨어진 요소를 건너뛴다 — 붙여 둠
  const opts = { footerHeight: 30, footer: sc.defs };
  const view = new FooterView({ container: () => c, options: () => opts, leaves: () => LEAVES, geometry: () => geo,
    widths: () => stored as number[], values: () => VALUES });
  if (applier) view.setApplier(ap);
  view.paint();
  return { geo, ap, c, view, stored };
}
/** 폭 하나를 바꿔 applyChange 만 한 DOM 과, 그 폭으로 처음부터 그린 DOM. */
function dragVsFresh(sc: Scene, ci: number, w: number) {
  const a = draw(sc);
  const before = a.c.innerHTML;
  const ch = a.geo.resize(L(ci), w);
  a.ap.applyChange(ch);
  const widths2 = sc.widths.slice(); widths2[ci] = w;
  const b = draw({ ...sc, widths: widths2 });
  const out = { dragged: a.c.innerHTML, fresh: b.c.innerHTML, before, a, b };
  a.c.remove(); b.c.remove();
  return out;
}
const W6 = [120, 130, 140, 150, 160, 170];

describe('C8 푸터 등록 — applyChange == 처음부터 그린 것', () => {
  it('C8-FT-01 값 칸이 덮는 컬럼(c2)을 넓힘 — 칸 폭·채움 칸 그대로(채움 칸은 남은 폭이라 안 바뀜), 바이트 같음', () => {
    const r = dragVsFresh({ widths: W6, extra: {}, defs: [{ label: '합', colspan: 2 }, { field: 'c2', op: 'sum' }] }, 2, 200);
    expect(r.dragged).not.toBe(r.before);
    expect(r.dragged).toBe(r.fresh);
  });

  it('C8-FT-02 colspan 칸이 덮는 컬럼(c0)을 좁힘 — 묶은 칸 폭이 같이 바뀜', () => {
    const r = dragVsFresh({ widths: W6, extra: {}, defs: [{ label: '합', colspan: 2 }, { field: 'c2', op: 'sum' }] }, 0, 80);
    expect(r.dragged).toBe(r.fresh);
  });

  it('C8-FT-03 푸터 정의 밖 컬럼(c5)을 넓힘 — 채움 칸이 늘어남(본문 전체 폭까지)', () => {
    const r = dragVsFresh({ widths: W6, extra: {}, defs: [{ field: 'c0', op: 'count' }] }, 5, 300);
    expect(r.dragged).toBe(r.fresh);
    expect(r.dragged).not.toBe(r.before);
  });

  it('C8-FT-04 여분 칸(상태·행번호·체크) 자리는 그대로, 칸만 바뀜', () => {
    const r = dragVsFresh({ widths: W6, extra: { stateColumn: true, rowNumber: true, checkColumn: true }, defs: [{ label: 'L' }, { label: 'M' }, { field: 'c2', op: 'sum' }, { label: 'N' }, { field: 'c4', op: 'sum' }] }, 3, 220);
    expect(r.dragged).toBe(r.fresh);
  });

  // 걸음 C15 로 새 뜻(예전 판: H-4 — 여분 칸 44·채움 칸 28 을 지금 동작으로 못 박음).
  it('C8-FT-05 [C15] 디테일 펼침 칸 켬 + 정의가 컬럼을 다 덮음 — 여분 칸 = 본문 여분 폭(72), 채움 칸 없음, applyChange == 처음부터 그린 것', () => {
    const defs = LEAVES.map((l) => ({ field: l.field, op: 'count' }));
    const r = dragVsFresh({ widths: W6, extra: { rowNumber: true, detailExpanderCol: true }, defs }, 1, 250);
    expect(r.dragged).toBe(r.fresh);
    const kids = Array.from(r.a.c.querySelector('.og-footer-bar')!.children) as HTMLElement[];
    expect(kids[0]!.style.width).toBe('72px');          // 여분 칸: 행번호 44 + 디테일 펼침 칸 28
    expect(r.a.c.querySelector('.og-footer-fill')).toBeNull();
  });

  // 검토 C-14 로 고침: 예전 판은 이 장면의 채움 칸을 등록하지 않아 「채움 칸 안 바뀜」을 기대했다 — 이제 trackGap(…, 빠진 여분 28) 로 등록.
  it('C8-FT-06 [C15] 디테일 켬 + 정의가 일부만 — 칸도 채움 칸(남은 잎 폭)도 따라와 applyChange == 처음부터 그린 것, 여분 칸 = 본문 여분 폭', () => {
    const sc = { widths: W6, extra: { rowNumber: true, detailExpanderCol: true }, defs: [{ field: 'c0', op: 'count' }, { field: 'c1', op: 'count' }] };
    const r = dragVsFresh(sc, 5, 300);
    expect(r.dragged).not.toBe(r.before);
    expect(r.dragged).toBe(r.fresh);
    const kids = Array.from(r.a.c.querySelector('.og-footer-bar')!.children) as HTMLElement[];
    expect(kids[0]!.style.width).toBe('72px');                       // 여분 칸: 행번호 44 + 디테일 28
    expect(kids.at(-1)!.style.width).toBe(`${140 + 150 + 160 + 300}px`); // 채움 칸 = c2~c5
  });

  it('C8-FT-07 저장 폭이 없어 100px 를 쓰는 잎이 섞인 칸은 등록하지 않음(기하를 안 따름) · 기하 폭만 쓰는 칸은 등록', () => {
    const sc = { widths: W6, extra: {}, defs: [{ label: 'A', colspan: 2 }, { field: 'c2', op: 'sum' }] };
    const a = draw(sc, [120, null, 140, 150, 160, 170]);
    // 등록: c2 칸 하나(span) — A 칸(c0·c1, c1 은 100px)과 채움 칸(앞 칸이 기하 폭이 아님)은 안 함
    expect(a.ap.trackedCount('footer')).toBe(1);
    a.ap.applyChange(a.geo.resize(L(1), 300));
    const kids = Array.from(a.c.querySelector('.og-footer-bar')!.children) as HTMLElement[];
    expect(kids[0]!.style.width).toBe('220px'); // 120 + 100(저장 폭 없음) 그대로
    a.c.remove();
  });

  it('C8-FT-08 다시 그리면 옛 등록을 푼다 — 등록 수 그대로, 옛 막대 요소에는 쓰지 않음 · destroy 뒤 등록 0', () => {
    const sc = { widths: W6, extra: {}, defs: [{ field: 'c0', op: 'count' }, { field: 'c1', op: 'count' }] };
    const a = draw(sc);
    const n1 = a.ap.trackedCount('footer');
    const oldBar = a.c.querySelector('.og-footer-bar')!;
    const oldHtml = oldBar.outerHTML;
    a.view.paint();
    expect(a.ap.trackedCount('footer')).toBe(n1);
    a.ap.applyChange(a.geo.resize(L(0), 90));
    expect(oldBar.outerHTML).toBe(oldHtml);
    a.view.destroy();
    expect(a.ap.trackedCount('footer')).toBe(0);
    a.c.remove();
  });

  it('C8-FT-09 등록기가 없으면(넘겨받기 전) 그리기는 지금과 같음 · 넘겨받으면 그린 막대를 한 번 다시 그려 등록', () => {
    const sc = { widths: W6, extra: {}, defs: [{ field: 'c0', op: 'count' }] };
    const plain = draw(sc, W6, false);
    const withAp = draw(sc);
    expect(plain.c.innerHTML).toBe(withAp.c.innerHTML);
    const ap = new GeometryApplier(plain.geo, NO_CELLS);
    plain.view.setApplier(ap);
    expect(ap.trackedCount('footer')).toBeGreaterThan(0);
    plain.c.remove(); withAp.c.remove();
  });
});
