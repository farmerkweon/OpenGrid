import { describe, it, expect } from 'vitest';
import {
  createDisplayFormatter, compileFormatSpec, FormatCache,
  type FormatContext, type FormatInput,
} from '../../../src/core/format/index.js';

const ctx = (consumer: FormatContext['consumer'] = 'cell', themeEpoch = 0): FormatContext =>
  ({ locale: { intlLocale: 'en-US' }, themeEpoch, consumer });
const inp = (raw: unknown, field = 'c', row?: unknown): FormatInput => ({ raw, field, row });

describe('DD-04 우선순위 합성 — 도메인 ≺ 로케일 ≺ 사용자포맷/훅', () => {
  it('음수 이중 부호화(괄호) + aria 마이너스 형태(색 단독 금지)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', negative: { style: 'parens' } });
    const r = df.format(inp(-1234), spec, ctx());
    expect(r.text).toBe('(1,234)');
    expect(r.aria).toBe('-1,234'); // 괄호 형태 대신 −기호 낭독
    expect(r.applied).toContain('negative');
  });

  it('음수 minusColor → colorHint 부착(형태=−기호 1차 부호)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', negative: { style: 'minusColor', color: 'Red' } });
    const r = df.format(inp(-50), spec, ctx());
    expect(r.text).toBe('-50');
    expect(r.colorHint).toBe('Red');
  });

  it('Excel 다중섹션 AST — 음수 [Red](#,##0) → 색코드+괄호', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', format: '#,##0;[Red](#,##0)' });
    const r = df.format(inp(-1234), spec, ctx());
    expect(r.text).toBe('(1,234)');
    expect(r.colorHint).toBe('Red');
    expect(r.applied).toContain('userFormat');
    // AA(KM-DB016): 괄호/색 단독 부호화 금지 — 음수 AST 섹션은 −기호 aria 병기
    expect(r.aria).toBe('-1,234');
  });

  it('큰수 축약(short) + 원값 rawText 보존(REQ-T2-013)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', abbreviate: { style: 'short' } });
    const r = df.format(inp(1234567), spec, ctx());
    expect(r.text).toBe('1.2M');
    expect(r.rawText).toBe('1234567');
    expect(r.applied).toContain('truncate');
  });

  it('축약(korean) 만/억', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', abbreviate: { style: 'korean' } });
    expect(df.text(inp(12000), spec, ctx())).toBe('1.2만');
    expect(df.text(inp(120000000), spec, ctx())).toBe('1.2억');
  });

  it('customHook(displayFormatter 슬롯) 마지막 적용', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({
      domain: 'number',
      customFormatter: (v: unknown) => `<<${v}>>`,
    });
    const r = df.format(inp(42), spec, ctx());
    expect(r.text).toBe('<<42>>');
    expect(r.applied).toContain('customHook');
  });

  it('customHook null 반환 → 파이프 산출 비파괴 폴백', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({
      domain: 'number', format: '#,##0',
      customFormatter: () => null as unknown as string,
    });
    const r = df.format(inp(1234), spec, ctx());
    expect(r.text).toBe('1,234'); // 파이프 산출 유지
    expect(r.applied).not.toContain('customHook');
  });
});

describe('DD-04 메모이즈 — FormatCache 히트/무효화(REQ-TX-888)', () => {
  it('동일 입력 2회 → 캐시 히트(동일 결과 객체)', () => {
    const cache = new FormatCache();
    const df = createDisplayFormatter({ overrides: { cache } });
    const spec = compileFormatSpec({ domain: 'number', format: '#,##0' });
    const a = df.format(inp(1234), spec, ctx());
    const b = df.format(inp(1234), spec, ctx());
    expect(b).toBe(a); // 동일 참조(히트)
    expect(cache.size).toBe(1);
  });

  it('테마 무효화 — 색코드 보유분만 제거(R3 부분 무효화)', () => {
    const cache = new FormatCache();
    const df = createDisplayFormatter({ overrides: { cache } });
    const plain = compileFormatSpec({ domain: 'number', format: '#,##0' });
    const colored = compileFormatSpec({ domain: 'number', format: '#,##0;[Red](#,##0)' });
    df.format(inp(100), plain, ctx());       // 무색
    df.format(inp(-100), colored, ctx());    // 색코드 보유
    expect(cache.size).toBe(2);
    df.onThemeChange();
    expect(cache.size).toBe(1); // 색코드 엔트리만 제거
  });

  it('결정론 — 동일 입력 바이트 동일 출력(불변식 1)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'currency', currency: 'USD' });
    const c = ctx();
    expect(df.text(inp(9999.99), spec, c)).toBe(df.text(inp(9999.99), spec, c));
  });
});
