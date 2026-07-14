// ============================================================
// DD-01 반올림 규칙 / DD-01 rounding rules
// 설계: DD-01 §2.1·§4.1(Strategy)·§5.3 rounding.ts · REQ-T2-804
// 반올림/은행가(HALF_EVEN)/버림(DOWN). OGDecimal(정밀) 위에서 정확 동작.
// ============================================================

import { OGDecimal } from '../OGDecimal.js';

/** 반올림 모드. / Rounding mode. */
export type RoundingMode = 'half-up' | 'half-even' | 'down';

/**
 * 반올림 규칙(Strategy). ValueType·포맷터·집계가 공유(REQ-T2-804).
 * / Rounding rule strategy shared by value types, formatters and aggregation.
 */
export interface RoundingRule {
  readonly mode: RoundingMode;
  /** value 를 dp 소수자리로 반올림한 새 OGDecimal. / Round `value` to `dp` places (new OGDecimal). */
  round(value: OGDecimal, dp: number): OGDecimal;
}

/**
 * 문자열(정확 표현) 기반 반올림 — OGDecimal 정밀 손실 없이 HALF_EVEN/HALF_UP/DOWN.
 * / Exact string-based rounding — no precision loss on OGDecimal.
 */
export function roundDecimal(value: OGDecimal, dp: number, mode: RoundingMode): OGDecimal {
  if (dp < 0) dp = 0;
  const neg = value.isNeg();
  const s = value.abs().toString();              // 정확한 비음수 십진 문자열 / exact non-negative decimal string
  const dot = s.indexOf('.');
  const intPart = dot === -1 ? s : s.slice(0, dot);
  const fracPart = dot === -1 ? '' : s.slice(dot + 1);

  if (fracPart.length <= dp) return value;        // 이미 dp 이내(정확) / already within dp

  const keep = fracPart.slice(0, dp);
  const rest = fracPart.slice(dp);
  const digitsStr = intPart + keep;               // value * 10^dp 의 정수부(부호 제외) / integer of value*10^dp
  const firstRest = rest.charCodeAt(0) - 48;

  let roundUp = false;
  if (mode === 'down') {
    roundUp = false;
  } else if (mode === 'half-up') {
    roundUp = firstRest >= 5;
  } else { // half-even (banker's)
    if (firstRest > 5) {
      roundUp = true;
    } else if (firstRest < 5) {
      roundUp = false;
    } else {
      const tail = rest.slice(1).replace(/0+$/, '');
      if (tail.length > 0) {
        roundUp = true;                           // 5 뒤에 잔여 → 올림 / non-zero after 5 → up
      } else {
        const lastKept = digitsStr.length ? digitsStr.charCodeAt(digitsStr.length - 1) - 48 : 0;
        roundUp = (lastKept % 2) === 1;           // 정확한 반 → 짝수로 / exact half → round to even
      }
    }
  }

  let big = BigInt(digitsStr || '0');
  if (roundUp) big += 1n;

  let out: string;
  if (dp === 0) {
    out = big.toString();
  } else {
    const ds = big.toString().padStart(dp + 1, '0');
    out = ds.slice(0, ds.length - dp) + '.' + ds.slice(ds.length - dp);
  }
  return OGDecimal.from((neg && big !== 0n ? '-' : '') + out);
}

/** RoundingRule 팩토리. / Build a RoundingRule for a mode. */
export function makeRoundingRule(mode: RoundingMode): RoundingRule {
  return { mode, round: (value, dp) => roundDecimal(value, dp, mode) };
}

/** 반올림(HALF_UP). / Round half up. */
export const HALF_UP: RoundingRule = makeRoundingRule('half-up');
/** 은행가 반올림(HALF_EVEN) — 회계 SSOT. / Banker's rounding. */
export const HALF_EVEN: RoundingRule = makeRoundingRule('half-even');
/** 버림(DOWN, 0 방향). / Truncate toward zero. */
export const DOWN: RoundingRule = makeRoundingRule('down');
