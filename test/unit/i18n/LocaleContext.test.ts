import { describe, it, expect, vi } from 'vitest';
import { LocaleContextProvider } from '../../../src/core/i18n/LocaleContext';
import { LocaleRegistry, localeRegistry } from '../../../src/core/i18n/LocaleRegistry';

/** ko·en 시드된 전역에서 격리 child 를 만든다(부모 active='ko'). / Isolated child off the ko/en-seeded global. */
function freshProvider() {
  const reg = localeRegistry.child();
  return { reg, provider: new LocaleContextProvider(reg) };
}

describe('LocaleContextProvider — 문화 컨텍스트 파사드 (REQ-T9-816)', () => {
  it('meta() 는 활성 로케일 문화 컨텍스트를 반환(기본 ko)', () => {
    const { provider } = freshProvider();
    expect(provider.meta().intlLocale).toBe('ko-KR');
  });

  it('setLocale 로 문화 컨텍스트가 전환되고 onChange 가 발화된다', () => {
    const { provider } = freshProvider();
    const cb = vi.fn();
    provider.onChange(cb);
    provider.setLocale('en');
    expect(provider.meta().intlLocale).toBe('en-US');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('미등록 로케일 setLocale 은 통지·전환하지 않는다(never-throw)', () => {
    const { provider } = freshProvider();
    const cb = vi.fn();
    provider.onChange(cb);
    provider.setLocale('zz-unknown');
    expect(cb).not.toHaveBeenCalled();
    expect(provider.meta().intlLocale).toBe('ko-KR');
  });

  it('동일 로케일 재설정은 통지하지 않는다', () => {
    const { provider } = freshProvider();
    const cb = vi.fn();
    provider.onChange(cb);
    provider.setLocale('ko');
    expect(cb).not.toHaveBeenCalled();
  });

  it('onChange 구독은 해제할 수 있다', () => {
    const { provider } = freshProvider();
    const cb = vi.fn();
    const off = provider.onChange(cb);
    off();
    provider.setLocale('en');
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('LocaleContextProvider — Intl 메모이즈', () => {
  it('collator 는 메모이즈되고 로케일 전환 시 재생성된다', () => {
    const { provider } = freshProvider();
    const c1 = provider.collator();
    expect(provider.collator()).toBe(c1); // 동일 인스턴스. / same instance.
    provider.setLocale('en');
    expect(provider.collator()).not.toBe(c1); // 전환 후 재생성. / recreated after switch.
  });

  it('numberFormat 은 같은 옵션에 대해 메모이즈된다', () => {
    const { provider } = freshProvider();
    const f1 = provider.numberFormat({ style: 'decimal' });
    expect(provider.numberFormat({ style: 'decimal' })).toBe(f1);
  });

  it('collation 규칙(LocaleMeta)이 collator 옵션으로 반영된다', () => {
    const reg = new LocaleRegistry();
    // ko 위에 collation 확장 meta 를 시드(additive LocaleMeta 필드). / seed ko with collation.
    (reg as any)._seed('ko', {}, { intlLocale: 'ko-KR', collation: { sensitivity: 'base', numeric: true } });
    const provider = new LocaleContextProvider(reg);
    const opts = provider.collator().resolvedOptions();
    expect(opts.numeric).toBe(true);
    expect(opts.sensitivity).toBe('base');
  });
});
