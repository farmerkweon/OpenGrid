// DD-10 §2.1~2.3 — 단일 제네릭 계약 + 정책 엔진 결정론.
// register/get/require/has/list/entries/unregister/dispose · 중복키 정책 · override 결정론(로드순 무관)
// · og:* 예약 · SPI peer · 다중적용 순서(orderedApply/detectAmbiguousOrder) · disposePlugin.
import { describe, it, expect, vi } from 'vitest';
import {
  TypedRegistry,
  orderedApply,
  detectAmbiguousOrder,
  spiCompatible,
} from '../../../src/core/extension/Registry';

describe('TypedRegistry: 기본 계약(register/get/require/has/list/entries/unregister/dispose)', () => {
  it('register→added, 재등록(비보호)→replaced, get/has/list/entries 정합', () => {
    const r = new TypedRegistry<number>();
    expect(r.register('a', 1).action).toBe('added');
    expect(r.get('a')).toBe(1);
    expect(r.has('a')).toBe(true);
    expect(r.register('a', 2).action).toBe('replaced');
    expect(r.get('a')).toBe(2);
    expect(r.list()).toEqual(['a']);
    expect(r.entries().map((e) => e.value)).toEqual([2]);
  });

  it('require: 미등록→fallback→placeholder 순, never-throw', () => {
    const r = new TypedRegistry<string>({ placeholder: (k) => `?${k}` });
    expect(r.require('x')).toBe('?x'); // placeholder
    expect(r.require('x', 'fb')).toBe('fb'); // fallback 우선
    r.register('x', 'v');
    expect(r.require('x')).toBe('v');
    const bare = new TypedRegistry<string>();
    expect(() => bare.require('none')).not.toThrow(); // never-throw
    expect(bare.require('none')).toBeUndefined();
  });

  it('unregister/dispose: dispose 후 get=undefined, register=rejected(disposed)', () => {
    const r = new TypedRegistry<number>();
    r.register('a', 1);
    expect(r.unregister('a')).toBe(true);
    expect(r.get('a')).toBeUndefined();
    r.register('b', 2);
    r.dispose();
    expect(r.get('b')).toBeUndefined();
    const res = r.register('c', 3);
    expect(res.action).toBe('rejected');
    expect(res.reason).toBe('disposed');
  });

  it('invalid-key 거부(빈 문자열)', () => {
    const r = new TypedRegistry<number>();
    expect(r.register('' as string, 1).reason).toBe('invalid-key');
  });
});

describe('중복키 정책 + override 결정론(§4.2 진리표, 로드순 무관)', () => {
  it('protect-builtin(기본): 내장 보호, override:true 로만 교체', () => {
    const r = new TypedRegistry<string>();
    r.register('currency', 'BUILTIN', { origin: 'builtin' });
    const kept = r.register('currency', 'MINE'); // override 미지정
    expect(kept.action).toBe('kept');
    expect(kept.ok).toBe(false);
    expect(r.get('currency')).toBe('BUILTIN'); // 보호 유지
    const replaced = r.register('currency', 'MINE', { override: true });
    expect(replaced.action).toBe('replaced');
    expect(r.get('currency')).toBe('MINE');
  });

  it('로드순 무관: 내장 보호 결과는 재시도 순서와 무관하게 동일', () => {
    const build = (order: Array<'builtin' | 'user'>) => {
      const r = new TypedRegistry<string>();
      for (const o of order) {
        if (o === 'builtin') r.register('k', 'B', { origin: 'builtin' });
        else r.register('k', 'U');
      }
      return r.get('k');
    };
    expect(build(['builtin', 'user'])).toBe('B');
    expect(build(['user', 'builtin'])).toBe('B'); // builtin 이 마지막이라도 보호되어 승 → 결정론
  });

  it('explicit-override: override 명시 없으면 항상 kept', () => {
    const r = new TypedRegistry<number>({ duplicatePolicy: 'explicit-override' });
    r.register('k', 1);
    expect(r.register('k', 2).action).toBe('kept');
    expect(r.get('k')).toBe(1);
    expect(r.register('k', 2, { override: true }).action).toBe('replaced');
    expect(r.get('k')).toBe(2);
  });

  it('last-wins: 비-builtin 은 항상 교체', () => {
    const r = new TypedRegistry<number>({ duplicatePolicy: 'last-wins' });
    r.register('k', 1);
    expect(r.register('k', 2).action).toBe('replaced');
    expect(r.get('k')).toBe(2);
  });
});

describe('og:* 예약 네임스페이스 가드(§2.4, TX-883)', () => {
  it('user/plugin 의 og:* 등록 거부 + 경고, builtin 은 점유 허용', () => {
    const warn = vi.fn();
    const r = new TypedRegistry<number>({ onWarn: warn });
    const rej = r.register('og:internal', 1);
    expect(rej.action).toBe('rejected');
    expect(rej.reason).toBe('reserved-namespace');
    expect(rej.warning).toContain('[OpenGrid]');
    expect(warn).toHaveBeenCalledTimes(1);
    // og- 접두도 예약
    expect(r.register('og-secret', 1).reason).toBe('reserved-namespace');
    // builtin 은 예약대 점유
    expect(r.register('og:core', 9, { origin: 'builtin' }).action).toBe('added');
    expect(r.get('og:core')).toBe(9);
  });

  it('경고 dedup: 동일 키·사유 반복 시 1회만', () => {
    const warn = vi.fn();
    const r = new TypedRegistry<number>({ onWarn: warn });
    r.register('og:x', 1);
    r.register('og:x', 1);
    r.register('og:x', 1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('SPI peer 검증(§2.5, TX-884)', () => {
  it('major 불일치 거부, 동일 major minor 차이 통과', () => {
    const r = new TypedRegistry<number>({ spi: { name: 'ICellRenderer', version: '2' } });
    expect(r.register('a', 1, { spiVersion: 'ICellRenderer@3' }).reason).toBe('spi-mismatch');
    expect(r.register('b', 1, { spiVersion: 'ICellRenderer@2' }).action).toBe('added');
    expect(r.register('c', 1, { spiVersion: '2.5.0' }).action).toBe('added'); // minor 무관
  });

  it('spiCompatible: @태그·점버전 major 비교', () => {
    expect(spiCompatible('2', 'ICellRenderer@2')).toBe(true);
    expect(spiCompatible('2.4.0', '2.9.1')).toBe(true);
    expect(spiCompatible('2', '3')).toBe(false);
  });
});

describe('다중적용 순서(§2.3): orderedApply priority→seq, detectAmbiguousOrder', () => {
  it('priority 오름차순, 동률은 등록순(seq)', () => {
    const r = new TypedRegistry<string>();
    r.register('A', 'A', { priority: 0 });
    r.register('B', 'B', { priority: 0 });
    r.register('C', 'C', { priority: -10 });
    expect(orderedApply(r).map((e) => e.value)).toEqual(['C', 'A', 'B']);
  });

  it('detectAmbiguousOrder: 동일 priority 2+건 감지(순서 민감 경고 근거)', () => {
    const r = new TypedRegistry<string>();
    r.register('A', 'A'); // priority 0
    r.register('B', 'B'); // priority 0
    r.register('C', 'C', { priority: 5 });
    expect(detectAmbiguousOrder(r.entries())).toEqual([0]);
    const clean = new TypedRegistry<string>();
    clean.register('A', 'A', { priority: 1 });
    clean.register('B', 'B', { priority: 2 });
    expect(detectAmbiguousOrder(clean.entries())).toEqual([]);
  });
});

describe('disposePlugin: 플러그인 단위 대칭 해제(§2.1, UC-10)', () => {
  it('pluginId 로 등록한 전 키만 해제, 타 플러그인·전역 무영향', () => {
    const r = new TypedRegistry<number>();
    r.register('a', 1, { pluginId: 'stars' });
    r.register('b', 2, { pluginId: 'stars' });
    r.register('c', 3, { pluginId: 'other' });
    r.register('d', 4);
    expect(r.disposePlugin('stars')).toBe(2);
    expect(r.has('a')).toBe(false);
    expect(r.has('b')).toBe(false);
    expect(r.has('c')).toBe(true);
    expect(r.has('d')).toBe(true);
  });
});
