// ============================================================
// DD-04 ① 값객체 해석 / DD-04 ① value interpreter
// 설계: DD-04 §2.3 · REQ-T9-838 · T6-803
// raw(DD-01 DomainValue/원시) → InterpretedValue. Money/Delta/Missing 언랩(읽기만·역참조 0).
// 반올림·통화 산술은 DD-01 위임(재구현 0).
// ============================================================

import type { DomainValue } from '../../domain/DomainValue.js';
import { numericOf } from '../../domain/DomainValue.js';
import type { MissingReason } from '../../domain/Missing.js';
import { OGDecimal } from '../../OGDecimal.js';
import type { FormatInput, InterpretedValue, IValueInterpreter, Sign } from '../types.js';

/** DomainValue 덕타이핑(런타임 값객체 판별). / Duck-type a DD-01 value object at runtime. */
function isDomainValue(v: unknown): v is DomainValue {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as { isMissing?: unknown }).isMissing === 'function' &&
    typeof (v as { hashKey?: unknown }).hashKey === 'function' &&
    'kind' in (v as object)
  );
}

/** 순수 수치 문자열 판별. / Whether a string is a pure numeric token. */
function looksNumeric(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s.trim());
}

function signOf(n: number): Sign {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
}

/**
 * 기본 값객체 해석기. DD-01 값객체는 읽기만, 원시값은 런타임 추론.
 * / Default interpreter. DD-01 value objects are read-only; primitives are inferred at runtime.
 */
export class ValueInterpreter implements IValueInterpreter {
  interpret(input: FormatInput): InterpretedValue {
    const raw = input.raw;

    // null/빈값 → 결측 / null/empty → missing
    if (raw === null || raw === undefined || raw === '') {
      return { sign: 'zero', valueKind: 'missing', isMissing: true };
    }

    // DD-01 값 객체 / DD-01 value object
    if (isDomainValue(raw)) {
      const valueKind = raw.kind;
      if (raw.isMissing()) {
        const reason = (raw as { reason?: MissingReason }).reason;
        const out: InterpretedValue = { sign: 'zero', valueKind, isMissing: true };
        return reason === undefined ? out : { ...out, missingReason: reason };
      }
      const dec = numericOf(raw);
      let magnitude = dec ? dec.toNumber() : undefined;
      let sign: Sign = dec ? signOf(dec.isNeg() ? -1 : dec.isPos() ? 1 : 0) : 'zero';
      // Delta: numericOf 는 절대 magnitude(|current-base|)를 돌려주므로 direction 으로 부호 복원(읽기만·역참조 0).
      // 감소 델타가 양수로 표기돼 음수 이중부호화(REQ-T2-012)가 안 걸리는 결함 차단.
      // / Delta.magnitude is absolute; recover the sign from direction (read-only, no re-aggregation).
      if (valueKind === 'delta') {
        const dir = (raw as { direction?: 'up' | 'down' | 'flat' }).direction;
        if (dir === 'down') { sign = 'neg'; if (magnitude !== undefined) magnitude = -Math.abs(magnitude); }
        else if (dir === 'up') sign = 'pos';
        else if (dir === 'flat') sign = 'zero';
      }
      const currency = (raw as { currency?: unknown }).currency;
      const base: InterpretedValue = { sign, valueKind, isMissing: false, text: raw.textEquivalent() };
      const withMag = magnitude !== undefined ? { ...base, magnitude } : base;
      return typeof currency === 'string' ? { ...withMag, currency } : withMag;
    }

    // Date
    if (raw instanceof Date) {
      return { sign: 'zero', valueKind: 'text', isMissing: false, date: raw, text: raw.toISOString() };
    }

    // number / bigint / OGDecimal
    if (typeof raw === 'number' || typeof raw === 'bigint' || raw instanceof OGDecimal) {
      const n = raw instanceof OGDecimal ? raw.toNumber() : Number(raw);
      return { magnitude: n, sign: signOf(n), valueKind: 'number', isMissing: false, text: String(raw) };
    }

    // string — 수치면 수치 계열, 아니면 텍스트 / numeric string → numeric; else text
    const s = String(raw);
    if (looksNumeric(s)) {
      const n = Number(s);
      return { magnitude: n, sign: signOf(n), valueKind: 'number', isMissing: false, text: s };
    }
    return { sign: 'zero', valueKind: 'text', isMissing: false, text: s };
  }
}
