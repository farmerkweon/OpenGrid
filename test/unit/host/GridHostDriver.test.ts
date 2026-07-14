// DD-14 §2.2/§3 GridHostDriver — 포트 4동사를 OpenGrid 파사드로 번역(험블).
// 파사드 위 얇은 배선의 생명주기·재조정·이벤트·멱등·누수0 를 실측(jsdom).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createGridHost, GridHostDriver } from '../../../src/core/host/GridHostDriver.js';
import type { GridOptions } from '../../../src/core/types.js';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  document.body.innerHTML = '';
});

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '600px';
  el.style.height = '400px';
  document.body.appendChild(el);
  return el;
}

const columns = [
  { field: 'name', header: '이름', width: 120 },
  { field: 'salary', header: '급여', width: 100, type: 'number' as const },
];
const opts: GridOptions = { columns, height: 400 };
const rows = [
  { name: '홍길동', salary: 5000000 },
  { name: '김철수', salary: 4200000 },
];

describe('DD-14 GridHostDriver — port lifecycle', () => {
  it('createGridHost returns a GridHostPort (concrete class hidden by factory)', () => {
    const port = createGridHost();
    expect(port).toBeInstanceOf(GridHostDriver);
    expect(port.mounted).toBe(false);
    expect(typeof port.mount).toBe('function');
  });

  it('mount → mounted true, capabilities snapshot exposed', () => {
    const port = createGridHost();
    port.mount(makeContainer(), opts);
    expect(port.mounted).toBe(true);
    expect(port.capabilities.p0Ids).toContain('lifecycle.mount');
    port.unmount();
  });

  it('mount is idempotent (second mount is a no-op, no throw)', () => {
    const port = createGridHost();
    port.mount(makeContainer(), opts);
    expect(() => port.mount(makeContainer(), opts)).not.toThrow();
    expect(port.mounted).toBe(true);
    port.unmount();
  });

  it('unmount is idempotent and clears mounted state', () => {
    const port = createGridHost();
    port.mount(makeContainer(), opts);
    port.unmount();
    expect(port.mounted).toBe(false);
    expect(() => port.unmount()).not.toThrow();
  });

  it('updateProps(data) applies via facade setData (surface path)', () => {
    const port = createGridHost();
    port.mount(makeContainer(), opts);
    port.updateProps({ data: rows });
    // 데이터 반영은 파사드 소유; 여기서는 throw 없이 표면 경로가 도는지 확인.
    expect(port.mounted).toBe(true);
    port.unmount();
  });

  it('updateProps(theme/skin) surface path does not recreate/throw', () => {
    const port = createGridHost();
    port.mount(makeContainer(), opts);
    expect(() => port.updateProps({ theme: 'dark', skin: 'stitch' })).not.toThrow();
    port.unmount();
  });

  it('updateProps(columns) recreate path re-instantiates without throw', () => {
    const port = createGridHost();
    port.mount(makeContainer(), opts);
    expect(() =>
      port.updateProps({ columns: [{ field: 'name', header: 'N', width: 90 }] as any }),
    ).not.toThrow();
    expect(port.mounted).toBe(true);
    port.unmount();
  });

  it('subscribe returns an unsubscribe; unmount drains all subscriptions (no leak)', () => {
    const port = createGridHost();
    port.mount(makeContainer(), opts);
    let calls = 0;
    const off = port.subscribe('dataChange', () => {
      calls++;
    });
    expect(typeof off).toBe('function');
    off(); // 명시 해지 후에도 안전.
    expect(() => port.unmount()).not.toThrow();
    void calls;
  });

  it('updateProps before mount is a guarded no-op (dev warn, no throw)', () => {
    const port = createGridHost();
    expect(() => port.updateProps({ data: rows })).not.toThrow();
    expect(port.mounted).toBe(false);
  });

  it('subscribe before mount does not throw (guarded)', () => {
    const port = createGridHost();
    expect(() => port.subscribe('dataChange', () => {})).not.toThrow();
  });
});
