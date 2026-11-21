// @vitest-environment jsdom
/**
 * 넓은 그리드 새 그물 — 걸음 CE-1(설계 C11, 세로 행 차분)의 EDGE 몫: 편집 중인 행 pin.
 * 편집 시작(키·마우스) 때 본문에 pin({ editRow: 그 행 }), 끝·취소 때 pin({ editRow: null }). 실제 브라우저판은 test/e2e/wg-ce1-edit-pin.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { CellEditManager } from '../../src/core/CellEditManager.js';

const COLS = Array.from({ length: 5 }, (_, i) => ({ field: 'c' + i, header: 'H' + i, editable: true }));

function mk(withPin = true) {
  const pins: Array<number | null> = [];
  const cells = new Map<string, HTMLElement>();
  const renderer = { getCellEl: (ri: number, ci: number) => { const k = ri + ':' + ci; if (!cells.has(k)) cells.set(k, document.createElement('div')); return cells.get(k)!; } };
  const mgr = new CellEditManager<any>({
    data: { getRowByIndex: (ri: number) => ({ c0: 'r' + ri }), getCellValue: () => 'v', updateCell: () => {}, getData: () => [] } as any,
    colLayout: {} as any, getRenderer: () => renderer as any, getContainer: () => document.createElement('div'),
    getOptions: () => ({ editable: true, editMode: 'dblclick' }), emit: () => {}, submitRender: () => {}, announce: () => {},
    t: (k: string) => k, writeCell: () => {}, scrollToRow: () => {}, getVisibleLeaves: () => COLS as any,
    ...(withPin ? { getBodyPin: () => ({ pin: (p: any) => { if ('editRow' in p) pins.push(p.editRow); } }) } : {}),
  });
  return { mgr, pins };
}

describe('CE-1 EDGE — 편집 중인 행 pin', () => {
  it('CE1-PIN-01 키 편집 시작 → pin(editRow: 그 행) · 취소 → pin(null)', () => {
    const { mgr, pins } = mk();
    mgr.startEditByKey(42, 1);
    expect(pins).toEqual([42]);
    mgr.cancelEdit();
    expect(pins).toEqual([42, null]);
  });

  it('CE1-PIN-02 마우스 편집 시작 → pin · 값 확정으로 끝 → pin(null)', () => {
    const { mgr, pins } = mk();
    mgr.startEdit(7, 2, new MouseEvent('dblclick'));
    expect(pins).toEqual([7]);
    mgr.commitEditWithValue(7, 2, 'x');
    expect(pins).toEqual([7, null]);
  });

  it('CE1-PIN-03 편집 중 다른 칸 편집 시작 → 옛 편집 끝(pin null) 뒤 새 행 pin', () => {
    const { mgr, pins } = mk();
    mgr.startEditByKey(3, 0);
    mgr.startEditByKey(9, 0);
    expect(pins).toEqual([3, null, 9]);
  });

  it('CE1-PIN-04 pin 받는 곳이 없으면(배선 전·옛 길) 지금처럼 — 던지지 않음', () => {
    const { mgr } = mk(false);
    expect(() => { mgr.startEditByKey(1, 1); mgr.cancelEdit(); }).not.toThrow();
  });
});
