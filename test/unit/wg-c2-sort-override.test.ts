/**
 * 걸음 C2 — 사용자 비교자 길 U-SRT-OV-01~04 (TEST_DESIGN_NEW §2-12, J: 공개 API).
 * 빠른 키 열(숫자·글자)이 들어온 뒤에도 override 비교자가 그대로 불리는지, 되돌리면 빠른 길로 돌아오는지.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

function makeGrid(rows: any[]) {
  const el = document.createElement('div');
  el.style.width = '600px';
  el.style.height = '300px';
  document.body.appendChild(el);
  const g = new OpenGrid(el, { columns: [{ field: 'f', header: 'F', width: 120 }, { field: 'n', header: 'N', width: 80, type: 'number' }], height: 300 });
  g.setData(rows.map(r => ({ ...r })));
  return g;
}
const vals = (g: any, f = 'f') => g.getData().map((r: any) => r[f]);

describe('C2 U-SRT-OV 사용자 비교자', () => {
  it('U-SRT-OV-01 override(sortComparator, 길이순) 뒤 orderBy — 길이순, fn 호출 ≥ 2', () => {
    const g = makeGrid([{ f: 'ccc' }, { f: 'a' }, { f: 'bb' }]);
    let calls = 0;
    g.override.strategy('sortComparator', (a: any, b: any) => { calls++; return String(a).length - String(b).length; });
    g.orderBy('f', 'asc');
    expect(vals(g)).toEqual(['a', 'bb', 'ccc']);
    expect(calls).toBeGreaterThanOrEqual(2);
    g.destroy();
  });

  it('U-SRT-OV-02 되돌림(restoreAll) 뒤 — 다시 사전순, fn 호출 0', () => {
    const g = makeGrid([{ f: 'b' }, { f: 'ccc' }, { f: 'aa' }]);
    let calls = 0;
    g.override.strategy('sortComparator', (a: any, b: any) => { calls++; return String(b).length - String(a).length; });
    g.orderBy('f', 'asc');
    expect(vals(g)).toEqual(['ccc', 'aa', 'b']);
    g.restoreAll();
    calls = 0;
    g.orderBy('f', 'asc');
    expect(vals(g)).toEqual(['aa', 'b', 'ccc']);
    expect(calls).toBe(0);
    g.destroy();
  });

  it('U-SRT-OV-03 사용자 fn 이 dir 를 읽음 — 인자 (a, b, field, dir) 그대로, 숫자 열에서도', () => {
    const g = makeGrid([{ n: 3 }, { n: 1 }, { n: 2 }]);
    const seen = new Set<string>();
    g.override.strategy('sortComparator', (a: any, b: any, field: string, dir: string) => { seen.add(`${field}:${dir}`); return dir === 'desc' ? a - b : a - b; });
    g.orderBy('n', 'desc');
    expect([...seen]).toEqual(['n:desc']);
    expect(vals(g, 'n')).toEqual([3, 2, 1]);
    g.destroy();
  });

  it('U-SRT-OV-04 사용자 fn 이 던지면 호출자에게 감(삼키지 않음)', () => {
    const g = makeGrid([{ f: 'b' }, { f: 'a' }]);
    g.override.strategy('sortComparator', () => { throw new Error('cmp-boom'); });
    expect(() => g.orderBy('f', 'asc')).toThrow('cmp-boom');
    g.destroy();
  });
});
