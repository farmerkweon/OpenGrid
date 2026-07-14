// DD-10 §2.7 — 뷰 슬롯 provider 통일: 슬롯당 1(protect-builtin) + safeMount fallback 사슬(never-blank).
import { describe, it, expect } from 'vitest';
import { createSlotRegistry, safeMount } from '../../../src/core/extension/SlotRegistry';
import type { ISlotProvider } from '../../../src/core/extension/SlotRegistry';

const mkProvider = (tag: string, onMount?: () => void): ISlotProvider => ({
  spi: 'ISlotProvider@1',
  mount: () => {
    onMount?.();
    return { tag };
  },
});

describe('SlotRegistry: IRegistry 동형(슬롯당 1, protect-builtin)', () => {
  it('빌트인 슬롯은 보호, override:true 로만 교체', () => {
    const reg = createSlotRegistry();
    reg.register('masterDetail', mkProvider('builtin'), { origin: 'builtin' });
    const kept = reg.register('masterDetail', mkProvider('user'));
    expect(kept.action).toBe('kept');
    expect((reg.get('masterDetail') as ISlotProvider).spi).toBe('ISlotProvider@1');
    const replaced = reg.register('masterDetail', mkProvider('user2'), { override: true });
    expect(replaced.action).toBe('replaced');
  });

  it('사용자 슬롯 등록/조회/해제', () => {
    const reg = createSlotRegistry();
    expect(reg.register('cell', mkProvider('c')).action).toBe('added');
    expect(reg.has('cell')).toBe(true);
    expect(reg.list()).toContain('cell');
    reg.dispose();
    expect(reg.get('cell')).toBeUndefined();
  });
});

describe('safeMount: fallback 사슬로 never-blank(UC-9)', () => {
  it('정상 provider 는 그대로 mount', () => {
    const p = mkProvider('ok');
    const h = safeMount(p, {}, {});
    expect(h).toEqual({ tag: 'ok' });
  });

  it('mount throw → fallback 으로 폴백', () => {
    const fallback = mkProvider('fb');
    const broken: ISlotProvider = {
      spi: 'ISlotProvider@1',
      mount: () => {
        throw new Error('boom');
      },
      fallback,
    };
    const h = safeMount(broken, {}, {});
    expect(h).toEqual({ tag: 'fb' });
  });

  it('전 사슬 실패 → null(코어는 계속 동작, throw 없음)', () => {
    const broken: ISlotProvider = {
      spi: 'ISlotProvider@1',
      mount: () => {
        throw new Error('boom');
      },
    };
    expect(() => safeMount(broken, {}, {})).not.toThrow();
    expect(safeMount(broken, {}, {})).toBeNull();
  });
});
