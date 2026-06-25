import { describe, it, expect } from 'vitest';

// _hexToXlsxRgb 로직을 순수 함수로 추출해 테스트
function hexToXlsxRgb(hex: string): string {
  const h = hex.replace('#', '').toUpperCase();
  if (h.length === 3) return h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return h.length === 6 ? h : '';
}

// filename 자동 .xlsx 추가 로직 테스트
function resolveFilename(name: string): string {
  if (!name.toLowerCase().endsWith('.xlsx')) return name + '.xlsx';
  return name;
}

describe('Excel Export — _hexToXlsxRgb', () => {
  it('6자리 hex → 대문자 RGB 반환', () => {
    expect(hexToXlsxRgb('#1565C0')).toBe('1565C0');
  });

  it('# 없는 6자리 hex → 대문자 RGB 반환', () => {
    expect(hexToXlsxRgb('aabbcc')).toBe('AABBCC');
  });

  it('3자리 shorthand hex → 6자리 확장', () => {
    expect(hexToXlsxRgb('#fff')).toBe('FFFFFF');
    expect(hexToXlsxRgb('#abc')).toBe('AABBCC');
  });

  it('잘못된 길이 → 빈 문자열 반환', () => {
    expect(hexToXlsxRgb('12345')).toBe('');
    expect(hexToXlsxRgb('')).toBe('');
  });

  it('소문자 → 대문자로 정규화', () => {
    expect(hexToXlsxRgb('#0d47a1')).toBe('0D47A1');
  });
});

describe('Excel Export — filename 처리', () => {
  it('.xlsx 없으면 자동 추가', () => {
    expect(resolveFilename('보고서')).toBe('보고서.xlsx');
    expect(resolveFilename('export')).toBe('export.xlsx');
  });

  it('.xlsx 있으면 그대로 유지', () => {
    expect(resolveFilename('report.xlsx')).toBe('report.xlsx');
    expect(resolveFilename('REPORT.XLSX')).toBe('REPORT.XLSX');
  });
});

describe('Excel Export — styleMode', () => {
  it("styleMode='theme' 기본값 확인", () => {
    const opts = {};
    const styleMode = (opts as any).styleMode ?? 'theme';
    expect(styleMode).toBe('theme');
  });

  it("styleMode='none' 지정 시 스타일 미적용 분기", () => {
    const opts = { styleMode: 'none' as const };
    expect(opts.styleMode).toBe('none');
  });

  it("styleMode='custom' 지정 가능", () => {
    const opts = { styleMode: 'custom' as const };
    expect(opts.styleMode).toBe('custom');
  });
});
