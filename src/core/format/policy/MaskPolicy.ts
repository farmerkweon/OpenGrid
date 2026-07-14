// ============================================================
// DD-04 마스킹 정책 / DD-04 mask policy
// 설계: DD-04 §2.3·§5·UC-5 · REQ-T6-803
// MaskingEngine.applyMask 를 IMaskPolicy 로 래핑만(로직 무수정 흡수). mask 도메인 단계 소비.
// ============================================================

import { applyMask } from '../../MaskingEngine.js';
import type { IMaskPolicy, MaskDef, MaskType } from '../types.js';

/**
 * 기본 마스킹 정책 — MaskingEngine.applyMask 래퍼(로직 재사용, 재구현 0).
 * / Default mask policy — a thin wrapper over MaskingEngine.applyMask (no reimplementation).
 */
export class MaskPolicy implements IMaskPolicy {
  mask(value: string, def: MaskType | MaskDef): string {
    return applyMask(value, def);
  }
}
