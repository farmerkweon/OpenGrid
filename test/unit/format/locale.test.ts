import { describe, it, expect } from 'vitest';
import {
  createDisplayFormatter, compileFormatSpec, FormatCache,
  type FormatContext, type FormatInput,
} from '../../../src/core/format/index.js';

const ctx = (intlLocale: string): FormatContext => ({ locale: { intlLocale }, themeEpoch: 0, consumer: 'cell' });
const inp = (raw: unknown): FormatInput => ({ raw });

describe('DD-04 로케일 — Intl 위임(하드코딩 ko-KR 제거)', () => {
  it('천단위·소수점 로케일별 전환(en-US ↔ de-DE)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number' });
    expect(df.text(inp(1234.5), spec, ctx('en-US'))).toBe('1,234.5');
    expect(df.text(inp(1234.5), spec, ctx('de-DE'))).toBe('1.234,5');
  });

  it('통화 서식은 로케일 소수 규칙 준수', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'currency', currency: 'USD' });
    expect(df.text(inp(1234.5), spec, ctx('en-US'))).toBe('$1,234.50');
  });

  it('백분율 서식(12.5 → 12.5%)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'percent' });
    expect(df.text(inp(12.5), spec, ctx('en-US'))).toBe('12.5%');
  });

  it('잘못된 통화코드 → never-throw 폴백(숫자+코드)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'currency', currency: 'ZZZ' });
    const out = df.text(inp(1000), spec, ctx('en-US'));
    expect(out).toContain('ZZZ');
    expect(out).toContain('1,000');
  });
});

describe('DD-04 로케일 — setLocale 전 표면 동시 반전(UC-3)', () => {
  it('onLocaleChange 후 새 로케일로 재산출', () => {
    const cache = new FormatCache();
    const df = createDisplayFormatter({ overrides: { cache } });
    const spec = compileFormatSpec({ domain: 'number' });
    expect(df.text(inp(1234.5), spec, ctx('en-US'))).toBe('1,234.5');
    df.onLocaleChange();
    expect(cache.size).toBe(0); // 로케일 축 무효화
    expect(df.text(inp(1234.5), spec, ctx('de-DE'))).toBe('1.234,5');
  });

  it('셀·차트(formatScalar)·집계가 같은 값=같은 표기(REQ-T6-802)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', format: '#,##0' });
    const cellText = df.text(inp(1234567), spec, ctx('en-US'));
    const chartLabel = df.formatScalar(1234567, spec, ctx('en-US'));
    expect(chartLabel).toBe(cellText);
    expect(chartLabel).toBe('1,234,567');
  });
});
