import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorksheetManager } from '../../src/core/WorksheetManager.js';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('WorksheetManager — 시트 추가/전환/삭제', () => {
  let container: HTMLElement;
  let onSwitch: ReturnType<typeof vi.fn>;
  let mgr: WorksheetManager;

  beforeEach(() => {
    container = makeContainer();
    onSwitch  = vi.fn();
    mgr       = new WorksheetManager(container, onSwitch);
  });

  it('add() — 첫 시트 추가 시 자동 전환', () => {
    mgr.add('Sheet1', [], []);
    expect(mgr.getActive()).toBe('Sheet1');
    expect(onSwitch).toHaveBeenCalledWith('Sheet1', expect.objectContaining({ name: 'Sheet1' }));
  });

  it('add() — 두 번째 시트는 자동 전환 안 됨', () => {
    mgr.add('Sheet1', [], []);
    onSwitch.mockClear();
    mgr.add('Sheet2', [], []);
    expect(mgr.getActive()).toBe('Sheet1');
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('add() — 중복 이름 → 에러', () => {
    mgr.add('Sheet1', [], []);
    expect(() => mgr.add('Sheet1', [], [])).toThrow(/이미 존재/);
  });

  it('switch() — 시트 전환 → onSwitch 호출', () => {
    mgr.add('Sheet1', [], []);
    mgr.add('Sheet2', [], [{ name: 'Alice' }] as any);
    mgr.switch('Sheet2');
    expect(mgr.getActive()).toBe('Sheet2');
    expect(onSwitch).toHaveBeenLastCalledWith('Sheet2', expect.objectContaining({ name: 'Sheet2' }));
  });

  it('switch() — 없는 시트 → 에러', () => {
    expect(() => mgr.switch('NotExist')).toThrow(/찾을 수 없/);
  });

  it('remove() — 시트 삭제 후 남은 시트로 자동 전환', () => {
    mgr.add('Sheet1', [], []);
    mgr.add('Sheet2', [], []);
    mgr.switch('Sheet2');
    mgr.remove('Sheet2');
    expect(mgr.getActive()).toBe('Sheet1');
    expect(mgr.getNames()).toEqual(['Sheet1']);
  });

  it('remove() — 마지막 시트 삭제 → 에러', () => {
    mgr.add('Sheet1', [], []);
    expect(() => mgr.remove('Sheet1')).toThrow(/마지막 시트/);
  });

  it('remove() — 없는 이름 → 무시', () => {
    mgr.add('Sheet1', [], []);
    expect(() => mgr.remove('NoExist')).not.toThrow();
  });
});

describe('WorksheetManager — 이름 변경', () => {
  it('rename() — 이름 변경 후 active 이름도 갱신', () => {
    const container = makeContainer();
    const mgr = new WorksheetManager(container, vi.fn());
    mgr.add('Sheet1', [], []);
    mgr.rename('Sheet1', '매출');
    expect(mgr.getActive()).toBe('매출');
    expect(mgr.getNames()).toContain('매출');
    expect(mgr.getNames()).not.toContain('Sheet1');
  });

  it('rename() — 중복 이름 → 에러', () => {
    const container = makeContainer();
    const mgr = new WorksheetManager(container, vi.fn());
    mgr.add('Sheet1', [], []);
    mgr.add('Sheet2', [], []);
    expect(() => mgr.rename('Sheet1', 'Sheet2')).toThrow(/이미 존재/);
  });
});

describe('WorksheetManager — getNames / get / syncData', () => {
  it('getNames() — 추가 순서대로 반환', () => {
    const container = makeContainer();
    const mgr = new WorksheetManager(container, vi.fn());
    mgr.add('A', [], []);
    mgr.add('B', [], []);
    mgr.add('C', [], []);
    expect(mgr.getNames()).toEqual(['A', 'B', 'C']);
  });

  it('get() — 없는 시트 → undefined', () => {
    const container = makeContainer();
    const mgr = new WorksheetManager(container, vi.fn());
    expect(mgr.get('NoExist')).toBeUndefined();
  });

  it('syncData() — 시트 데이터 갱신', () => {
    const container = makeContainer();
    const mgr = new WorksheetManager(container, vi.fn());
    mgr.add('Sheet1', [], []);
    const newData = [{ id: 1 }] as any;
    mgr.syncData('Sheet1', newData);
    expect(mgr.get('Sheet1')!.data).toBe(newData);
  });
});

describe('WorksheetManager — 탭 UI', () => {
  it('.og-sheet-tabs 탭바가 컨테이너 안에 생성됨', () => {
    const container = makeContainer();
    new WorksheetManager(container, vi.fn());
    expect(container.querySelector('.og-sheet-tabs')).not.toBeNull();
  });

  it('시트 추가 시 탭 버튼 렌더링', () => {
    const container = makeContainer();
    const mgr = new WorksheetManager(container, vi.fn());
    mgr.add('Sheet1', [], []);
    mgr.add('Sheet2', [], []);
    const tabs = container.querySelectorAll('.og-sheet-tab');
    expect(tabs.length).toBe(2);
  });

  it('활성 탭에 .og-sheet-tab--active 클래스 적용', () => {
    const container = makeContainer();
    const mgr = new WorksheetManager(container, vi.fn());
    mgr.add('Sheet1', [], []);
    mgr.add('Sheet2', [], []);
    mgr.switch('Sheet2');
    const active = container.querySelector('.og-sheet-tab--active');
    expect(active?.textContent).toBe('Sheet2');
  });

  it("'+' 버튼 존재", () => {
    const container = makeContainer();
    const mgr = new WorksheetManager(container, vi.fn());
    mgr.add('Sheet1', [], []);
    expect(container.querySelector('.og-sheet-add')).not.toBeNull();
  });
});
