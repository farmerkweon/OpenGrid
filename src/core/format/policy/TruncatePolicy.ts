// ============================================================
// DD-04 큰수 축약 정책 / DD-04 large-number abbreviation policy
// 설계: DD-04 §2.3 · REQ-T2-013
// K/M/B(short) · 만/억/조(korean) 축약 + 원값(rawText) 보존(hover·클립보드·export 복원).
// ============================================================

import type { AbbrevPolicy, FormatContext, ITruncatePolicy } from '../types.js';

/** short 스케일(1e3 단위). / Short scale (1e3 steps). */
const SHORT: Array<[number, string]> = [
  [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'],
];
/** 한국어 스케일(만·억·조). / Korean scale (만/억/조). */
const KOREAN: Array<[number, string]> = [
  [1e12, '조'], [1e8, '억'], [1e4, '만'],
];

/**
 * 기본 축약 정책. threshold(기본 1000) 이상 절대값만 축약. 미만이면 null(미참여) 반환.
 * / Default abbreviation policy; abbreviates only at/above threshold, else null.
 */
export class TruncatePolicy implements ITruncatePolicy {
  abbreviate(n: number, p: AbbrevPolicy, _ctx: FormatContext): { text: string; rawText: string } | null {
    const threshold = p.threshold ?? 1000;
    const abs = Math.abs(n);
    if (abs < threshold) return null;

    const digits = p.digits ?? 1;
    const table = p.style === 'korean' ? KOREAN : SHORT;
    const rawText = String(n);

    for (const [factor, unit] of table) {
      if (abs >= factor) {
        const scaled = n / factor;
        const text = trimZeros(scaled.toFixed(digits)) + unit;
        return { text, rawText };
      }
    }
    return null;
  }
}

/** 후행 0·불필요한 소수점 제거('1.0'→'1', '1.20'→'1.2'). / Trim trailing zeros. */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
