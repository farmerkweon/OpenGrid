import { describe, it, expect } from 'vitest';
import {
  createDisplayFormatter, compileFormatSpec,
  type FormatContext, type FormatInput,
} from '../../../src/core/format/index.js';
import { Money } from '../../../src/core/domain/Money.js';
import { Percent } from '../../../src/core/domain/Ratios.js';
import { Delta } from '../../../src/core/domain/Delta.js';
import { PlainNumber } from '../../../src/core/domain/Plain.js';
import { Missing, MissingReason } from '../../../src/core/domain/Missing.js';

const ctxKo = (consumer: FormatContext['consumer'] = 'cell'): FormatContext => ({
  locale: { intlLocale: 'ko-KR' }, themeEpoch: 0, consumer,
});
const inp = (raw: unknown, field = 'c'): FormatInput => ({ raw, field });

describe('DD-04 파이프 — 값객체 → 표시(interpret→domainType→locale)', () => {
  it('원시 숫자 + 포맷 AST → 천단위 그룹', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', format: '#,##0' });
    expect(df.text(inp(1234567), spec, ctxKo())).toBe('1,234,567');
  });

  it('DD-01 Money 값객체 → 통화 서식(currency 언랩)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'money' });
    const out = df.text(inp(Money.of('1234.5', 'USD')), spec, ctxKo());
    expect(out).toContain('1,234.50'); // Intl 통화(로케일 심볼 무관 본문 검증)
  });

  it('DD-01 Percent 값객체 → 백분율 서식', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'percent' });
    expect(df.text(inp(Percent.of('12.5')), spec, ctxKo())).toBe('12.5%');
  });

  it('DD-01 Delta 값객체 → 부호·크기(자동 도메인)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number' });
    // Delta.from(120,100) magnitude=20 (절대델타), sign pos
    const r = df.format(inp(Delta.from(120, 100)), spec, ctxKo());
    expect(r.text).toBe('20');
    expect(r.sign).toBe('pos');
  });

  it('DD-01 Delta 감소 → 부호 neg 복원(절대 magnitude 부호 손실 방지, REQ-T2-012/T9-838)', () => {
    const df = createDisplayFormatter();
    // 감소 델타(magnitude 는 절대값이지만 direction=down → 표시 부호는 음수)
    const spec = compileFormatSpec({ domain: 'number', negative: { style: 'parens' } });
    const r = df.format(inp(Delta.from(100, 120)), spec, ctxKo());
    expect(r.sign).toBe('neg');
    expect(r.text).toBe('(20)');   // 음수 이중부호화가 실제로 걸림
    expect(r.aria).toBe('-20');
  });

  it('PlainNumber 값객체 + precision → 소수 고정', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', precision: 2 });
    expect(df.text(inp(PlainNumber.of('3.1')), spec, ctxKo())).toBe('3.10');
  });

  it('applied provenance = interpret·domainType·locale', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number' });
    const r = df.format(inp(1234), spec, ctxKo());
    expect(r.applied).toContain('interpret');
    expect(r.applied).toContain('domainType');
    expect(r.applied).toContain('locale');
  });
});

describe('DD-04 파이프 — null/결측 4-state', () => {
  it('null → 기본 빈 표기(nullPolicy 미지정)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number' });
    expect(df.text(inp(null), spec, ctxKo())).toBe('');
  });

  it('DD-01 Missing 값객체 → nullPolicy.text 우선', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number', nullPolicy: { text: '—' } });
    const r = df.format(inp(Missing.of(MissingReason.NoData)), spec, ctxKo());
    expect(r.text).toBe('—');
    expect(r.applied).toContain('null');
  });

  it('Missing aria 는 결측 사유 낭독(원값 아님)', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'number' });
    const r = df.format(inp(Missing.of(MissingReason.Suppressed)), spec, ctxKo());
    expect(r.aria).toContain('suppressed');
  });
});

describe('DD-04 파이프 — date/text/valueMap 도메인', () => {
  it('date 도메인 + 커스텀 패턴', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'date', datePattern: 'yyyy-MM-dd' });
    expect(df.text(inp(new Date(2026, 0, 15)), spec, ctxKo())).toBe('2026-01-15');
  });

  it('text 도메인 → 원문 유지', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'text' });
    expect(df.text(inp('hello'), spec, ctxKo())).toBe('hello');
  });

  it('valueMap(열거형) → 도메인타입보다 우선', () => {
    const df = createDisplayFormatter();
    const spec = compileFormatSpec({ domain: 'text', valueMap: { A: '활성', I: '비활성' } });
    expect(df.text(inp('A'), spec, ctxKo())).toBe('활성');
  });
});
