import { describe, it, expect, vi } from 'vitest';
import { AccessibilityAdapter, cellKey, parseCellKey } from '../../../src/core/a11y/AccessibilityAdapter';
import type { A11yModelView } from '../../../src/core/a11y/AccessibilityAdapter';
import { LiveRegionController } from '../../../src/core/a11y/LiveRegionController';
import type { FormatResult } from '../../../src/core/format/types';
import { FakeRenderPort, manualScheduler } from './_helpers';

function setup() {
  const render = new FakeRenderPort();
  const sched = manualScheduler();
  const live = new LiveRegionController({ render, schedule: sched.schedule, cancel: sched.cancel, t: (k, p) => `${k}(${JSON.stringify(p ?? {})})` });
  const adapter = new AccessibilityAdapter({ render, live });
  return { render, sched, live, adapter };
}

const view = (over: Partial<A11yModelView> = {}): A11yModelView => ({
  rows: 100, cols: 8, selection: [], invalidCells: new Set(), ...over,
});

const fr = (over: Partial<FormatResult> = {}): FormatResult => ({ text: '', applied: [], ...over });

describe('AccessibilityAdapter — projectGrid', () => {
  it('role=grid + rowcount/colcount/label 를 투영한다', () => {
    const { render, adapter } = setup();
    adapter.projectGrid(view({ label: '매출 그리드' }));
    const intent = render.last('grid')!;
    expect(intent.role).toBe('grid');
    expect(intent.attrs['aria-rowcount']).toBe('100');
    expect(intent.attrs['aria-colcount']).toBe('8');
    expect(intent.attrs['aria-label']).toBe('매출 그리드');
  });
});

describe('AccessibilityAdapter — projectCell (불변식 2: raw 미노출)', () => {
  it('aria-label 은 마스킹된 display.aria 에서만 파생하고 raw 는 노출하지 않는다', () => {
    const { adapter } = setup();
    const key = cellKey(41, 2);
    const intent = adapter.projectCell(key, view(), fr({ text: '010-1234-5678', aria: '010-****-5678' }));
    expect(intent.attrs['aria-label']).toBe('010-****-5678');
    expect(intent.attrs['aria-label']).not.toContain('1234');
    expect(intent.labelFromDisplay).toBe(true);
  });

  it('aria 는 없고 text 만 있으면 text 로 폴백한다', () => {
    const { adapter } = setup();
    const intent = adapter.projectCell(cellKey(0, 0), view(), fr({ text: '1,234원' }));
    expect(intent.attrs['aria-label']).toBe('1,234원');
  });

  it('rowindex/colindex 는 1-based, 선택 셀은 aria-selected=true', () => {
    const { adapter } = setup();
    const v = view({ selection: [{ r1: 5, c1: 1, r2: 7, c2: 3 }] });
    const inside = adapter.projectCell(cellKey(6, 2), v, fr({ text: 'x' }));
    expect(inside.attrs['aria-rowindex']).toBe('7');
    expect(inside.attrs['aria-colindex']).toBe('3');
    expect(inside.attrs['aria-selected']).toBe('true');
    const outside = adapter.projectCell(cellKey(0, 0), v, fr({ text: 'y' }));
    expect(outside.attrs['aria-selected']).toBeUndefined();
  });

  it('invalidCells 에 있으면 aria-invalid=true', () => {
    const { adapter } = setup();
    const key = cellKey(3, 3);
    const intent = adapter.projectCell(key, view({ invalidCells: new Set([key]) }), fr({ text: 'z' }));
    expect(intent.attrs['aria-invalid']).toBe('true');
  });
});

describe('AccessibilityAdapter — projectSort/projectSelection', () => {
  it('aria-sort 를 헤더에 투영하고 sort 공지를 병합키로 큐에 넣는다', () => {
    const { render, sched, adapter } = setup();
    adapter.projectSort(view({ sort: { field: 'amount', dir: 'desc', colKey: 'col:amount' } }));
    expect(render.last('col:amount')!.attrs['aria-sort']).toBe('descending');
    sched.flush();
    expect(render.spoken.length).toBe(1);
    expect(render.spoken[0]!.text).toContain('sort.announce');
  });

  it('정렬 해제(dir=none)는 aria-sort 를 제거(undefined)한다', () => {
    const { render, adapter } = setup();
    adapter.projectSort(view({ sort: { field: 'amount', dir: 'none', colKey: 'col:amount' } }));
    expect(render.last('col:amount')!.attrs['aria-sort']).toBeUndefined();
  });

  it('선택 요약 공지는 셀 수 + 경계상자(1-based) 5파라미터를 전달한다', () => {
    const { render, sched, adapter } = setup();
    adapter.projectSelection(view({ selection: [{ r1: 0, c1: 0, r2: 2, c2: 1 }] })); // 3×2 = 6
    sched.flush();
    const text = render.spoken[0]!.text;
    expect(text).toContain('"n":6');
    // 카탈로그 range.selectionAnnounce 가 요구하는 r1/c1/r2/c2(1-based) 전량 전달 확인(DD-12 QA 결함 락).
    expect(text).toContain('"r1":1');
    expect(text).toContain('"c1":1');
    expect(text).toContain('"r2":3');
    expect(text).toContain('"c2":2');
  });

  it('선택이 비면 요약 공지를 내지 않는다', () => {
    const { render, sched, adapter } = setup();
    adapter.projectSelection(view({ selection: [] }));
    sched.flush();
    expect(render.spoken.length).toBe(0);
  });
});

describe('AccessibilityAdapter — projectError (REQ-T9-831)', () => {
  it('aria-invalid + assertive 즉시 공지 + 오류 셀 포커스 이관', () => {
    const { render, adapter } = setup();
    const key = cellKey(9, 1);
    const req = adapter.projectError(key, 'formula.cellErrorAnnounce', { field: 'amount', message: '오류' });
    expect(render.last(key)!.attrs['aria-invalid']).toBe('true');
    expect(req).toEqual({ target: key, reason: 'error', selectText: true });
    expect(render.focused[0]).toEqual(req);
    // assertive 즉시 발화. / assertive announced immediately.
    expect(render.spoken.some(s => s.channel === 'assertive')).toBe(true);
  });
});

describe('AccessibilityAdapter — onLocaleChange', () => {
  it('등록된 재투영 콜백을 발화하고 에폭을 증가시킨다', () => {
    const { adapter } = setup();
    const spy = vi.fn();
    const off = adapter.onReproject(spy);
    adapter.onLocaleChange();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(adapter.localeEpoch()).toBe(1);
    off();
    adapter.onLocaleChange();
    expect(spy).toHaveBeenCalledTimes(1); // 해제 후 미호출. / not called after unsubscribe.
    expect(adapter.localeEpoch()).toBe(2);
  });
});

describe('cellKey/parseCellKey 왕복', () => {
  it('조립·파싱 왕복', () => {
    expect(parseCellKey(cellKey(42, 3))).toEqual({ row: 42, col: 3 });
    expect(parseCellKey('overlay:filter')).toBeNull();
  });
});
