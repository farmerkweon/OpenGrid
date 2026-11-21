// @vitest-environment jsdom
/**
 * 넓은 그리드 새 그물 — 걸음 C9(가로 가상화)의 EDGE 몫, 가짜 협력자로 본 단위판.
 * E-01(화면 밖 칸 Enter 편집) · HS-12 새 뜻(포커스 가로 따라가기) · pinned(편집·포커스 컬럼) · 범위 테두리 창 밖 모서리(기하).
 * 실제 브라우저 입력판은 test/e2e/wg-c9-edge.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { CellEditManager } from '../../src/core/CellEditManager.js';
import { RangeSelectionManager } from '../../src/core/RangeSelectionManager.js';
import { RangeOverlayAdapter } from '../../src/core/render/RangeOverlayAdapter.js';
import { Change } from '../../src/core/domain/render/ports.js';

const COLS = Array.from({ length: 50 }, (_, i) => ({ field: 'c' + i, header: 'H' + i, editable: true }));

/** 칸 지도를 흉내 낸 가짜 렌더러: present 에 든 [ri,ci] 만 칸이 있음(가로 창 흉내). */
function fakeRenderer(present: Set<string>) {
  const cells = new Map<string, HTMLElement>();
  return {
    getCellEl: (ri: number, ci: number) => {
      const k = ri + ':' + ci;
      if (!present.has(k)) return null;
      if (!cells.has(k)) { const d = document.createElement('div'); d.className = 'og-cell'; cells.set(k, d); }
      return cells.get(k)!;
    },
    bodyWrapper: document.createElement('div'),
  };
}

function mkEdit(present: Set<string>, extra: Record<string, any> = {}) {
  const log: string[] = [];
  const renderer = fakeRenderer(present);
  const data = { getRowByIndex: (ri: number) => ({ c0: 'r' + ri, c49: 'x' + ri }), getCellValue: () => 'v', updateCell: () => {}, getData: () => [] };
  const mgr = new CellEditManager<any>({
    data: data as any, colLayout: {} as any, getRenderer: () => renderer as any, getContainer: () => document.createElement('div'),
    getOptions: () => ({ editable: true }), emit: (ev: string) => log.push('emit:' + ev),
    submitRender: (req: any) => { log.push('submit:' + req.changes + (req.detail?.sync ? ':sync' : '')); if (extra.onSubmit) extra.onSubmit(req); },
    announce: () => {}, t: (k: string) => k, writeCell: () => {}, scrollToRow: () => {}, getVisibleLeaves: () => COLS as any,
    ...(extra.reveal ? { revealColumn: (ci: number) => { log.push('reveal:' + ci); extra.reveal(ci); } } : {}),
  });
  return { mgr, log, renderer };
}

describe('C9 EDGE — 편집·포커스 (단위)', () => {
  it('C9-EDGE-01 pinnedColumns: 없음 [] · 포커스만 [ci] · 편집+포커스 오름차순 둘 · 같으면 하나 · 값이 같으면 같은 배열', () => {
    const { mgr } = mkEdit(new Set(['0:3', '0:40']), { reveal: () => {} });
    const empty = mgr.pinnedColumns();
    expect(empty).toEqual([]);
    expect(mgr.pinnedColumns()).toBe(empty);
    mgr.setFocusCell(0, 40);
    const p1 = mgr.pinnedColumns();
    expect(p1).toEqual([40]);
    expect(mgr.pinnedColumns()).toBe(p1);
    mgr.startEditByKey(0, 3);
    expect(mgr.pinnedColumns()).toEqual([3, 40]);
    mgr.cancelEdit();
    expect(mgr.pinnedColumns()).toEqual([40]);
    mgr.setFocusCell(0, 3);
    mgr.startEditByKey(0, 3);
    expect(mgr.pinnedColumns()).toEqual([3]);
  });

  it('C9-EDGE-02 HS-12 새 뜻 — setFocusCell 이 그 컬럼을 가로로 보이게(revealColumn) 부름', () => {
    const { mgr, log } = mkEdit(new Set(), { reveal: () => {} });
    mgr.setFocusCell(5, 49);
    expect(log).toContain('reveal:49');
    expect(log.indexOf('reveal:49')).toBeLessThan(log.findIndex((x) => x.startsWith('submit:')));
  });

  it('C9-EDGE-03 E-01 — 창 밖 칸 Enter 편집: 칸이 없으면 보이게 + 창 요청 sync 를 한 뒤 다시 찾아 편집 시작(editStart 1번)', () => {
    const present = new Set<string>();
    const { mgr, log } = mkEdit(present, {
      reveal: () => {},
      onSubmit: (req: any) => { if (req.changes === Change.ColsScrolled && req.detail?.sync) present.add('2:45'); }, // 창이 그 자리에서 맞춰짐
    });
    mgr.startEditByKey(2, 45);
    expect(log).toContain('reveal:45');
    expect(log).toContain(`submit:${Change.ColsScrolled}:sync`);
    expect(mgr.activeEditor).not.toBeNull();
    expect(mgr.editCell).toEqual({ ri: 2, ci: 45 });
    expect(log.filter((x) => x === 'emit:editStart').length).toBe(1);
  });

  it('C9-EDGE-04 창을 맞춰도 칸이 끝내 없으면 지금처럼 조용히 돌아감(던지지 않음 · 편집 상태 없음)', () => {
    const { mgr } = mkEdit(new Set(), { reveal: () => {} });
    expect(() => mgr.startEditByKey(2, 45)).not.toThrow();
    expect(mgr.activeEditor).toBeNull();
  });

  it('C9-EDGE-05 편집 시작으로 pinned 가 바뀌면 창 다시 정하기 요청(ColsScrolled, 다음 프레임) 1번', () => {
    const { mgr, log } = mkEdit(new Set(['0:7']), { reveal: () => {} });
    mgr.startEditByKey(0, 7);
    expect(log.filter((x) => x === `submit:${Change.ColsScrolled}`).length).toBe(1);
  });

  it('C9-EDGE-06 칸이 떨어진 뒤 편집을 끝내도 편집기는 정리됨(destroy 1번) · 던지지 않음', () => {
    const present = new Set(['0:7']);
    const { mgr } = mkEdit(present, { reveal: () => {} });
    mgr.startEditByKey(0, 7);
    let destroyed = 0;
    const ed = mgr.activeEditor as any;
    const orig = ed.destroy.bind(ed);
    ed.destroy = () => { destroyed++; orig(); };
    present.clear(); // 행이 밀려 칸이 사라짐
    expect(() => mgr.cancelEdit()).not.toThrow();
    expect(destroyed).toBe(1);
    expect(mgr.activeEditor).toBeNull();
  });

  it('C9-EDGE-07 revealColumn 이 없으면(배선 전·옛 길) 포커스는 지금처럼 세로만 — 던지지 않음', () => {
    const { mgr, log } = mkEdit(new Set());
    expect(() => mgr.setFocusCell(1, 49)).not.toThrow();
    expect(log.some((x) => x.startsWith('reveal'))).toBe(false);
  });
});

describe('C9 EDGE — 범위 테두리(단위)', () => {
  function mkRange(present: Set<string>, rangeRect?: any) {
    const renderer = fakeRenderer(present);
    const mgr = new RangeSelectionManager<any>({ ...(rangeRect ? { rangeRect } : {}) } as any);
    return { mgr, renderer };
  }
  const R = { startRow: 1, endRow: 3, startCol: 2, endCol: 45 };

  it('C9-EDGE-08 모서리 칸 하나가 창 밖 → 기하 사각형으로(테두리가 사라지지 않음)', () => {
    let asked: any = null;
    const { mgr, renderer } = mkRange(new Set(['1:2']), (r: any) => { asked = r; return { left: 10, top: 20, width: 300, height: 95 }; });
    const box = (mgr as any)._boxOf(renderer, R);
    expect(asked).toBe(R);
    expect(box).toEqual({ left: 10, top: 20, right: 310, bottom: 115 });
  });

  it('C9-EDGE-09 두 모서리 칸이 다 있으면 칸을 잼(기하는 묻지 않음 — 창이 전 컬럼이면 지금과 같음)', () => {
    let asked = 0;
    const { mgr, renderer } = mkRange(new Set(['1:2', '3:45']), () => { asked++; return null; });
    const box = (mgr as any)._boxOf(renderer, R);
    expect(asked).toBe(0);
    expect(box).toEqual({ left: 0, top: 0, right: 0, bottom: 0 }); // jsdom 의 칸 사각형은 0
  });

  it('C9-EDGE-10 모서리가 창 밖이고 기하 함수도 없으면 null(지금처럼 숨김)', () => {
    const { mgr, renderer } = mkRange(new Set(['1:2']));
    expect((mgr as any)._boxOf(renderer, R)).toBeNull();
  });

  it('C9-EDGE-11 RangeOverlayAdapter — repaint 를 그대로 맡김', () => {
    let n = 0;
    new RangeOverlayAdapter({ repaint: () => { n++; } }).repaint();
    expect(n).toBe(1);
  });
});
