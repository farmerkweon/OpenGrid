// ============================================================
// DD-04 음수 이중 부호화 정책 / DD-04 negative dual-encoding policy
// 설계: DD-04 §2.3·UC-4 · REQ-T2-012
// 회계 괄호/−기호(+색). 색 단독 부호화 금지 — 형태(괄호/−)가 1차 부호, colorHint 는 힌트일 뿐.
// aria 는 괄호를 −기호 형태로 낭독(SR "minus …") — 형태 의존 회피(KM-DB016).
// ============================================================

import type { INegativePolicy, NegativePolicy as NegPolicy, Sign } from '../types.js';

/**
 * 기본 음수 정책. 이미 로케일 서식된 문자열을 받아 부호화 형태로 변환.
 * / Default negative policy; transforms an already locale-formatted string.
 */
export class NegativePolicy implements INegativePolicy {
  encode(text: string, sign: Sign, p: NegPolicy): { text: string; aria?: string; colorHint?: string } {
    if (sign !== 'neg') return { text };

    // 로케일 부호(선행 '-' 또는 유니코드 '−') 제거한 절대 표기 / strip leading minus for abs form
    const stripped = text.replace(/^[-−]/, '');
    const minusForm = `-${stripped}`;

    switch (p.style) {
      case 'parens': {
        // aria 는 괄호 형태 대신 −기호 형태로(SR 낭독 정합) / aria uses minus form, not parens
        const out: { text: string; aria?: string; colorHint?: string } = {
          text: `(${stripped})`, aria: minusForm,
        };
        if (p.color !== undefined) out.colorHint = p.color;
        return out;
      }
      case 'minusColor': {
        const out: { text: string; aria?: string; colorHint?: string } = { text: minusForm };
        out.colorHint = p.color ?? 'Red';
        return out;
      }
      case 'minus':
      default:
        return { text: minusForm };
    }
  }
}
