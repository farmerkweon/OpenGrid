// ============================================================
// DD-05 §2.5·§9.4 채움 위 텍스트 대비 자동보증 — InkResolver(정직성의 최후 방어선)
// / DD-05 §2.5·§9.4 automatic fill-above text-contrast guarantee — InkResolver. REQ: T5-807 · T5-011.
// ------------------------------------------------------------
// 채움색 명도로 잉크 흑/백을 자동 선택 → 항상 ≥4.5:1. 대비 1차 함수는 palette.ts 단일 소유를 재사용
// (재구현 0). 중간 명도대에서 흑·백 어느 쪽도 4.5:1 미달이면 폴백(외곽선 1px halo). 커스텀 램프도 이
// 게이트를 반드시 통과(§4.7 정직성=협상 불가). 순수·헤드리스.
// ============================================================

import { contrastRatio } from '../chart/palette.js';

/** WCAG bodyText 임계(표준 SSOT). / WCAG body-text minimum. */
export const AA_BODY = 4.5;

/** 잉크(텍스트 색) 결정. outline=중간명도 폴백(1px halo). / Ink decision; outline = mid-luminance fallback. */
export interface InkDecision {
  /** 선택된 텍스트 색(흑/백). / The chosen text color (black/white). */
  readonly color: string;
  /** 대비 미달 시 외곽선(halo) 폴백 지시. / Outline (halo) fallback when contrast is short. */
  readonly outline?: boolean;
  /** 폴백 외곽선 색(반대 잉크). / Fallback outline color (opposite ink). */
  readonly outlineColor?: string;
  /** 달성 대비비(진단·게이트). / Achieved contrast ratio (diagnostics/gate). */
  readonly ratio: number;
}

/** 채움 위 텍스트 색 선택 계약(Strategy). / Fill-above ink selection contract (Strategy). */
export interface InkResolver {
  pickInk(fillColor: string): InkDecision;
}

const BLACK = '#111111';
const WHITE = '#ffffff';

/**
 * 기본 잉크 해석기 — 흑/백 중 대비 큰 쪽 선택, 둘 다 4.5:1 미달이면 외곽선 폴백.
 * / Default ink resolver — pick the higher-contrast of black/white; outline fallback when both < 4.5:1.
 */
export class DefaultInkResolver implements InkResolver {
  pickInk(fillColor: string): InkDecision {
    const cBlack = contrastRatio(BLACK, fillColor);
    const cWhite = contrastRatio(WHITE, fillColor);
    const pickWhite = cWhite >= cBlack;
    const color = pickWhite ? WHITE : BLACK;
    const ratio = pickWhite ? cWhite : cBlack;
    if (ratio >= AA_BODY) {
      return { color, ratio };
    }
    // 중간 명도대 폴백: 더 나은 잉크 + 반대색 외곽선(halo)으로 판독성 확보(§9.4).
    return { color, outline: true, outlineColor: pickWhite ? BLACK : WHITE, ratio };
  }
}

/**
 * 커스텀 램프/스타일 등록 시 AA 게이트(§4.7 T5-807b) — 채움색이 흑·백 폴백 없이 AA 를 만족하는가.
 * false 면 등록/사용 전에 폴백 필요. 우회 불가(정직성 하드룰).
 * / AA gate for custom ramps/styles — whether a fill meets AA without fallback. Non-bypassable.
 *
 * @param fillColor - 검사할 채움색 / The fill color to test
 * @returns AA 통과 여부 / Whether AA passes without fallback
 */
export function passesInkGate(fillColor: string): boolean {
  return Math.max(contrastRatio(BLACK, fillColor), contrastRatio(WHITE, fillColor)) >= AA_BODY;
}
