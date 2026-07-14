import { describe, it, expect } from 'vitest';
import {
  createDisplayFormatter, compileFormatSpec, FormatterRegistry, FormatCache,
  type FormatContext, type FormatInput, type IFormatter,
} from '../../../src/core/format/index.js';
import { applyMask } from '../../../src/core/MaskingEngine.js';

const ctx = (consumer: FormatContext['consumer'] = 'cell'): FormatContext =>
  ({ locale: { intlLocale: 'ko-KR' }, themeEpoch: 0, consumer });
const inp = (raw: unknown): FormatInput => ({ raw });

describe('DD-04 마스킹 정합 — MaskingEngine 흡수(UC-5 3계층)', () => {
  it('phone 마스킹 = applyMask 와 동일(로직 무수정 흡수)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ mask: 'phone' });
    const r = df.format(inp('01012345678'), spec, ctx());
    expect(r.text).toBe(applyMask('01012345678', 'phone'));
    expect(r.text).toBe('010-****-5678');
  });

  it('raw/display/editor 3계층 — rawText=원값, aria=마스킹값(원값 유출 0)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ mask: 'ssn' });
    const r = df.format(inp('9301011234567'), spec, ctx());
    expect(r.text).toBe('930101-1******'); // display
    expect(r.rawText).toBe('9301011234567'); // raw 보존(편집 진입값)
    expect(r.aria).toBe(r.text);             // aria=마스킹값(원값 낭독 금지)
    expect(r.applied).toContain('mask');
  });

  it('email 마스킹 MaskDef(char 옵션)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ mask: { type: 'email', char: '#' } });
    expect(df.text(inp('hong@example.com'), spec, ctx())).toBe(applyMask('hong@example.com', { type: 'email', char: '#' }));
  });
});

describe('DD-04 FormatterRegistry — 커스텀 IFormatter(REQ-T9-002)', () => {
  const upper: IFormatter = {
    spi: 'IFormatter@1', name: 'upper',
    format: (v) => String(v).toUpperCase(),
    parse: (t) => t.toLowerCase(),
  };

  it('등록·해석·능력목록', () => {
    const reg = new FormatterRegistry();
    reg.register(upper);
    expect(reg.resolve('upper')).toBe(upper);
    expect(reg.has('upper')).toBe(true);
    expect(reg.list()).toContain('upper');
    expect(reg.resolve('nope')).toBeUndefined();
  });

  it('child 격리 — 자식 등록이 부모 오염 0', () => {
    const parent = new FormatterRegistry();
    const child = parent.child();
    child.register(upper);
    expect(child.resolve('upper')).toBe(upper);
    expect(parent.resolve('upper')).toBeUndefined(); // 부모 미오염
  });

  it('이름 지정 customFormatter 가 파이프 마지막 훅으로 소비', () => {
    const reg = new FormatterRegistry();
    reg.register(upper);
    const df = createDisplayFormatter({ overrides: { registry: reg } });
    const spec = compileFormatSpec({ domain: 'text', customFormatter: 'upper' });
    expect(df.text(inp('abc'), spec, ctx())).toBe('ABC');
  });
});

describe('DD-04 FormatCache — LRU·무효화', () => {
  it('max 초과 시 최오래된 축출(LRU)', () => {
    const cache = new FormatCache(2);
    const df = createDisplayFormatter({ overrides: { cache } });
    const spec = compileFormatSpec({ domain: 'number' });
    df.format(inp(1), spec, ctx());
    df.format(inp(2), spec, ctx());
    df.format(inp(3), spec, ctx()); // 1 축출
    expect(cache.size).toBe(2);
  });

  it('invalidateLocale 전체 클리어', () => {
    const cache = new FormatCache();
    const df = createDisplayFormatter({ overrides: { cache } });
    const spec = compileFormatSpec({ domain: 'number' });
    df.format(inp(1), spec, ctx());
    df.format(inp(2), spec, ctx());
    expect(cache.size).toBe(2);
    cache.invalidateLocale();
    expect(cache.size).toBe(0);
  });
});
