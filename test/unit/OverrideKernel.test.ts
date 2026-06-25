import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';
import { OverrideKernel } from '../../src/core/OverrideKernel';

// jsdom 환경에 없는 ResizeObserver mock
beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

function makeGrid(container = document.createElement('div')) {
  container.style.width  = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  return new OpenGrid(container, {
    columns: [
      { field: 'name',   header: '이름', width: 120, editable: true },
      { field: 'dept',   header: '부서', width: 100, editable: true },
      { field: 'salary', header: '급여', width: 100, type: 'number', editable: true },
    ],
    height: 400,
  });
}

const sampleData = [
  { name: '홍길동', dept: '개발팀', salary: 5000000 },
  { name: '김철수', dept: '마케팅팀', salary: 4200000 },
  { name: '이영희', dept: '인사팀', salary: 3800000 },
];

// ─── 1. 단독 커널: 직접 host 객체로 단위 검증 ───────────────────
describe('OverrideKernel — 단독 단위 (host = 일반 객체)', () => {
  function makeHost() {
    return {
      add(a: number, b: number) { return a + b; },
      greet(n: string) { return `hi ${n}`; },
      noop() { return undefined as any; },
    };
  }

  it('override 1회: shadowing 후 fn 실행, orig 호출 시 원본 동작', () => {
    const host: any = makeHost();
    const k = new OverrideKernel(host);
    k.override('add', (orig, a, b) => orig(a, b) * 10);
    expect(host.add(2, 3)).toBe(50);          // (2+3)*10
    expect(k.hasOverride('add')).toBe(true);
  });

  it('restore: 원본 복구 + hasOverride=false', () => {
    const host: any = makeHost();
    const k = new OverrideKernel(host);
    k.override('add', (orig, a, b) => orig(a, b) + 1);
    expect(host.add(1, 1)).toBe(3);
    k.restore('add');
    expect(host.add(1, 1)).toBe(2);           // 원본 복구
    expect(k.hasOverride('add')).toBe(false);
  });

  it('restore 미등록 메서드: no-op', () => {
    const host: any = makeHost();
    const k = new OverrideKernel(host);
    expect(() => k.restore('add')).not.toThrow();
  });

  // ── F2: FIFO 합성 좌측폴드 — fn3 최외곽, orig 안쪽 전파 ──
  it('FIFO 합성 3레이어: fn3(최후등록)이 최외곽, orig() 전파', () => {
    const host: any = { run() { return ['orig']; } };
    const k = new OverrideKernel(host);
    const order: string[] = [];
    k.override('run', (orig) => { order.push('fn1-pre');  const r = orig(); order.push('fn1-post'); return r; });
    k.override('run', (orig) => { order.push('fn2-pre');  const r = orig(); order.push('fn2-post'); return r; });
    k.override('run', (orig) => { order.push('fn3-pre');  const r = orig(); order.push('fn3-post'); return r; });

    const result = host.run();
    // fn3(최후등록)이 가장 먼저 실행(최외곽), orig 가 안쪽(fn1)으로 전파
    expect(order).toEqual([
      'fn3-pre', 'fn2-pre', 'fn1-pre',
      'fn1-post', 'fn2-post', 'fn3-post',
    ]);
    expect(result).toEqual(['orig']);
  });

  it('FIFO 합성: 값 변환 누적 (fn3(fn2(fn1(original))))', () => {
    const host: any = { val() { return 1; } };
    const k = new OverrideKernel(host);
    k.override('val', (orig) => orig() + 1);   // fn1: +1
    k.override('val', (orig) => orig() * 2);   // fn2: *2
    k.override('val', (orig) => orig() - 3);   // fn3: -3
    // 실행: fn3( fn2( fn1( 1 ) ) ) = ((1+1)*2) - 3 = 1
    expect(host.val()).toBe(1);
  });

  // ── F3: 재진입 가드 ──
  it('재진입 가드: 동일 name 사이클 차단 → 원본 fallback (무한루프 없음)', () => {
    const host: any = { tick(n: number): number { return n; } };
    const k = new OverrideKernel(host);
    let depth = 0;
    k.override('tick', (orig, n) => {
      depth++;
      if (depth > 100) throw new Error('infinite loop');
      // override 안에서 같은 메서드 재호출 → 사이클 감지로 원본 실행되어야 함
      return host.tick(n) + 1;
    });
    const r = host.tick(5);
    // 재진입은 원본(=5)으로 떨어지고 +1 → 6, 무한루프 없음
    expect(r).toBe(6);
    expect(depth).toBe(1);
  });

  it('재진입 가드: cross-name 사이클 차단 (A→B→A)', () => {
    const host: any = { a(): string { return 'A'; }, b(): string { return 'B'; } };
    const k = new OverrideKernel(host);
    const calls: string[] = [];
    k.override('a', (orig) => { calls.push('a'); return orig() + host.b(); });
    k.override('b', (orig) => { calls.push('b'); return orig() + host.a(); });
    // a → b → a(사이클차단,원본'A')
    const r = host.a();
    expect(r).toBe('A' + 'B' + 'A');
    expect(calls).toEqual(['a', 'b']); // a 두번 진입 안함
  });

  it('재진입 가드: 정당한 cascade(깊이 내, 다른 name)는 허용', () => {
    const host: any = { outer(): string { return 'O'; }, inner(): string { return 'I'; } };
    const k = new OverrideKernel(host);
    k.override('inner', (orig) => 'X' + orig());
    k.override('outer', (orig) => orig() + host.inner());  // 다른 name 호출 → 허용
    expect(host.outer()).toBe('O' + 'XI');
  });

  it('재진입 가드: { reentrant:true } 옵트인 시 동일 name 재귀 허용', () => {
    const host: any = { fact(n: number): number { return 1; } };  // 원본은 항상 1
    const k = new OverrideKernel(host);
    k.override('fact', (orig, n: number): number => {
      if (n <= 1) return 1;
      return n * host.fact(n - 1);  // 재귀
    }, { reentrant: true });
    expect(host.fact(5)).toBe(120);
  });

  it('재진입 가드: maxDepth 초과 시 차단 (reentrant 무한재귀 방지)', () => {
    const host: any = { rec(): number { return 0; } };
    const k = new OverrideKernel(host, { strict: false, maxDepth: 8 });
    let count = 0;
    k.override('rec', (orig): number => {
      count++;
      return host.rec() + 1; // reentrant 옵트인 없음 → 사이클 차단되어 원본(0)+1
    }, { reentrant: true });
    // reentrant 이지만 maxDepth=8 에서 멈춤 (strict:false → 원본 fallback)
    const r = host.rec();
    expect(count).toBeLessThanOrEqual(8);
    expect(r).toBeGreaterThan(0);
  });

  // ── F4: 에러 격리 ──
  it('에러 격리: 기본 strict=true → 예외 전파', () => {
    const host: any = makeHost();
    const k = new OverrideKernel(host); // strict 기본 true
    k.override('add', () => { throw new Error('boom'); });
    expect(() => host.add(1, 2)).toThrow('boom');
  });

  it('에러 격리: { onError:fallback } + strict=false → 경고 후 orig 실행', () => {
    const host: any = makeHost();
    const k = new OverrideKernel(host, { strict: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    k.override('add', () => { throw new Error('boom'); }, { onError: 'fallback' });
    const r = host.add(2, 3);
    expect(r).toBe(5);                  // 원본 동작
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // ── restoreAll + strategy ──
  it('restoreAll: 다중 override 복구 + strategy clear', () => {
    const host: any = makeHost();
    const k = new OverrideKernel(host);
    k.override('add', (orig, a, b) => orig(a, b) + 100);
    k.override('greet', (orig, n) => orig(n) + '!');
    k.strategy('mySlot', () => 42);
    expect(k.hasStrategy('mySlot')).toBe(true);
    expect(k.getOverrideNames().sort()).toEqual(['add', 'greet']);

    k.restoreAll();
    expect(host.add(1, 1)).toBe(2);
    expect(host.greet('x')).toBe('hi x');
    expect(k.getOverrideNames()).toEqual([]);
    expect(k.hasStrategy('mySlot')).toBe(false);
  });

  // ── strategy / getStrategy ──
  it('strategy / getStrategy: 등록 시 커스텀, 미등록 시 fallback', () => {
    const host: any = makeHost();
    const k = new OverrideKernel(host);
    const fb = () => 'fallback';
    expect(k.getStrategy('slotX', fb)()).toBe('fallback');
    k.strategy('slotX', () => 'custom');
    expect(k.getStrategy('slotX', fb)()).toBe('custom');
  });
});

// ─── 2. OpenGrid 통합: 순수 래핑 + 위임 ──────────────────────
describe('OverrideKernel — OpenGrid 통합 (순수 래핑)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('override 는 호출가능 + .strategy 멤버를 가진다', () => {
    const grid = makeGrid();
    expect(typeof grid.override).toBe('function');
    expect(typeof grid.override.strategy).toBe('function');
  });

  it('override 는 체이닝 위해 grid 인스턴스를 반환', () => {
    const grid = makeGrid();
    const ret = grid.override('getDisplayValue', (orig, r, f) => orig(r, f));
    expect(ret).toBe(grid);
  });

  it('setData override: orig 호출 시 원본 동작 (순수 래핑)', () => {
    const grid = makeGrid();
    let called = 0;
    grid.override('setData', (orig, data: any[]) => { called++; return orig(data); });
    grid.setData(sampleData);
    expect(called).toBe(1);
    expect(grid.getData()).toHaveLength(3);
  });

  it('writeCell override: before 검증으로 값 가로채기', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    grid.override('writeCell', (orig, ri: number, field: string, val: any) => {
      // salary 음수 방지
      if (field === 'salary' && val < 0) return orig(ri, field, 0);
      return orig(ri, field, val);
    });
    grid.writeCell(0, 'salary', -999);
    expect(grid.readCell(0, 'salary')).toBe(0);
    grid.writeCell(1, 'salary', 9999);
    expect(grid.readCell(1, 'salary')).toBe(9999);
  });

  it('getDisplayValue override: after 후처리 (포맷팅)', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    grid.override('getDisplayValue', (orig, ri: number, field: string) => {
      const v = orig(ri, field);
      return field === 'salary' ? `₩${v}` : v;
    });
    expect(grid.getDisplayValue(0, 'salary')).toBe('₩5000000');
    expect(grid.getDisplayValue(0, 'name')).toBe('홍길동');
  });

  it('restore: 원본 복구 후 override 효과 사라짐', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    grid.override('getDisplayValue', (orig, ri: number, f: string) => `X${orig(ri, f)}`);
    expect(grid.getDisplayValue(0, 'name')).toBe('X홍길동');
    grid.restore('getDisplayValue');
    expect(grid.getDisplayValue(0, 'name')).toBe('홍길동');
    expect(grid.hasOverride('getDisplayValue')).toBe(false);
  });

  it('getOverrideNames / hasOverride 인트로스펙션', () => {
    const grid = makeGrid();
    grid.override('setData', (o, d) => o(d));
    grid.override('writeCell', (o, ...a) => (o as any)(...a));
    expect(grid.getOverrideNames().sort()).toEqual(['setData', 'writeCell']);
    expect(grid.hasOverride('setData')).toBe(true);
    expect(grid.hasOverride('deleteRow')).toBe(false);
  });

  it('getStrategy: override.strategy 등록 후 조회', () => {
    const grid = makeGrid();
    const fb = () => 'default';
    expect(grid.getStrategy('summaryOp', fb)()).toBe('default');
    grid.override.strategy('summaryOp', () => 'custom');
    expect(grid.getStrategy('summaryOp', fb)()).toBe('custom');
  });

  it('destroy 후 getOverrideNames() 빈배열 + 원본 정리 호출(removeAllListeners)', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    grid.override('setData', (o, d) => o(d));
    expect(grid.getOverrideNames()).toContain('setData');

    const spy = vi.spyOn(grid, 'removeAllListeners');
    grid.destroy();
    // 원본 destroy 본문이 호출됨(removeAllListeners 는 원본 destroy 말미)
    expect(spy).toHaveBeenCalled();
    // restoreAll 로 override 정리됨
    expect(grid.getOverrideNames()).toEqual([]);
  });

  it('destroy 순수 래핑: 사용자 destroy override 후에도 원본+restoreAll 보장', () => {
    const grid = makeGrid();
    let userRan = false;
    grid.override('destroy', (orig) => { userRan = true; orig(); });
    const spy = vi.spyOn(grid, 'removeAllListeners');
    grid.destroy();
    expect(userRan).toBe(true);
    expect(spy).toHaveBeenCalled();
    expect(grid.getOverrideNames()).toEqual([]);
  });

  it('strict 에러 전파: overrideStrict 기본(true)에서 throw', () => {
    const grid = makeGrid();
    grid.override('getDisplayValue', () => { throw new Error('fail'); });
    expect(() => grid.getDisplayValue(0, 'name')).toThrow('fail');
  });
});

// ─── 3. 정적 전역 defaults ──────────────────────────────────
describe('OverrideKernel — 정적 전역 defaults', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    // 정적 레지스트리 초기화 (테스트 격리)
    (OpenGrid as any)._defaultOverrides.length = 0;
    (OpenGrid as any)._defaultStrategies.length = 0;
  });

  it('OpenGrid.defaultOverride: 신규 인스턴스에 자동 적용', () => {
    OpenGrid.defaultOverride('getDisplayValue', (orig, r: number, f: string) => `[${orig(r, f)}]`);
    const grid = makeGrid();
    grid.setData([...sampleData]);
    expect(grid.getDisplayValue(0, 'name')).toBe('[홍길동]');
    expect(grid.hasOverride('getDisplayValue')).toBe(true);
  });

  it('OpenGrid.defaults.strategy: 신규 인스턴스에 슬롯 자동 적용', () => {
    OpenGrid.defaults.strategy('summaryOp', () => 'GLOBAL');
    const grid = makeGrid();
    expect(grid.getStrategy('summaryOp', () => 'fb')()).toBe('GLOBAL');
  });
});
