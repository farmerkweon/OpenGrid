// DD-10 §5.2·§4.5 — 기존 레지스트리 어댑트(파괴적 재작성 금지). 원본 무교란 + IRegistry 계약.
import { describe, it, expect } from 'vitest';
import { adaptRegistry, adaptFormatterRegistry, adaptSkinRegistry } from '../../../src/core/extension/adapters';
import { FormatterRegistry } from '../../../src/core/format/FormatterRegistry';
import { SkinRegistry } from '../../../src/core/SkinRegistry';
import type { IFormatter } from '../../../src/core/format/types';

describe('adaptRegistry: 임의 브리지 → IRegistry 계약', () => {
  it('예약 가드·충돌 정책·왕복 위임', () => {
    const store = new Map<string, number>();
    const reg = adaptRegistry<number>({
      get: (k) => store.get(k),
      has: (k) => store.has(k),
      list: () => [...store.keys()],
      set: (k, v) => {
        store.set(k, v);
      },
      delete: (k) => store.delete(k),
    });
    expect(reg.register('a', 1).action).toBe('added');
    expect(reg.get('a')).toBe(1);
    expect(store.get('a')).toBe(1); // 원본 저장소에 위임됨
    expect(reg.register('og:x', 1).reason).toBe('reserved-namespace');
    // builtin 보호
    reg.register('b', 10, { origin: 'builtin' });
    expect(reg.register('b', 20).action).toBe('kept');
    expect(reg.get('b')).toBe(10);
    expect(reg.unregister('a')).toBe(true);
    expect(store.has('a')).toBe(false);
  });

  it('원본에 직등록된 내장 키(어댑터 메타 없음)도 protect-builtin 으로 보호(QA-FOWLER)', () => {
    // 실제 시나리오: SkinRegistry/FormatterRegistry 는 부트스트랩에서 원본 store 에 직접 내장을
    // 심는다(어댑터를 거치지 않음). 어댑터 meta 는 그 키를 모르지만 entries() 는 builtin 으로 라벨한다.
    // register 도 동일하게 코어 보호를 적용해야 결정론(REQ-T4-802)이 성립한다.
    const store = new Map<string, number>([['builtinKey', 100]]); // 어댑터 밖에서 선등록
    const reg = adaptRegistry<number>({
      get: (k) => store.get(k),
      has: (k) => store.has(k),
      list: () => [...store.keys()],
      set: (k, v) => {
        store.set(k, v);
      },
    });
    const kept = reg.register('builtinKey', 200); // override 미지정
    expect(kept.action).toBe('kept');
    expect(kept.reason).toBe('protected-builtin');
    expect(store.get('builtinKey')).toBe(100); // 원본 내장 유지
    // override:true 로만 교체 가능
    expect(reg.register('builtinKey', 200, { override: true }).action).toBe('replaced');
    expect(store.get('builtinKey')).toBe(200);
  });

  it('set 이 throw 해도 rejected(adapter-error)로 값화(never-throw)', () => {
    const reg = adaptRegistry<number>({
      get: () => undefined,
      has: () => false,
      list: () => [],
      set: () => {
        throw new Error('nope');
      },
    });
    let res!: ReturnType<typeof reg.register>;
    expect(() => {
      res = reg.register('a', 1);
    }).not.toThrow();
    expect(res.action).toBe('rejected');
    expect(res.reason).toBe('adapter-error');
  });
});

describe('adaptFormatterRegistry: 기존 FormatterRegistry 무교란 어댑트', () => {
  it('신 API 등록 → 구 API resolve 동일성(왕복)', () => {
    const base = new FormatterRegistry();
    const reg = adaptFormatterRegistry(base);
    const fmt: IFormatter = { spi: 'IFormatter@1', name: 'upper', format: (v) => String(v).toUpperCase() };
    expect(reg.register('upper', fmt).action).toBe('added');
    // 구 API 로 조회해도 동일 참조
    expect(base.resolve('upper')).toBe(fmt);
    // 신 API get
    expect(reg.get('upper')).toBe(fmt);
    expect(reg.has('upper')).toBe(true);
    expect(reg.list()).toContain('upper');
  });
});

describe('adaptSkinRegistry: define 색리터럴 throw 를 어댑터가 격리', () => {
  it('FORM-only 스킨은 등록, 색 리터럴 스킨은 rejected(never-throw)', () => {
    const base = new SkinRegistry();
    const reg = adaptSkinRegistry(base);
    // FORM 토큰만 → 정상 등록
    expect(reg.register('my-sharp', { '--og-radius-md': '0' }).action).toBe('added');
    expect(base.has('my-sharp')).toBe(true);
    // 색 리터럴 → 원본 define 이 throw → 어댑터가 rejected 로 격리
    let res!: ReturnType<typeof reg.register>;
    expect(() => {
      res = reg.register('bad', { '--og-border-style': '#ff0000' } as any);
    }).not.toThrow();
    expect(res.action).toBe('rejected');
    expect(res.reason).toBe('adapter-error');
  });
});
