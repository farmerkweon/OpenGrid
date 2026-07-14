// ============================================================
// DD-03 §9.5.1 표면 위 텍스트 AA — 배경 명도 → AA-safe 텍스트색 선택 (REQ-T5-807)
// 순수·헤드리스(DOM 접근 0). 배경이 리터럴 색(hex/rgb)일 때만 판정하고, var()/none/미해석은
// undefined 를 반환해 렌더 레이어가 기존 텍스트색(--og-cell-color)을 그대로 쓰게 한다(회귀 0).
// ============================================================

/** WCAG 상대명도 산출용 sRGB 채널 → 선형화. / sRGB channel → linear (WCAG relative luminance). */
function _lin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** rgb(0..255) → WCAG 상대명도(0..1). / rgb → WCAG relative luminance. */
function _luminance(r: number, g: number, b: number): number {
  return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b);
}

/** 두 명도의 WCAG 대비비(≥1). / WCAG contrast ratio between two luminances. */
function _ratio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 리터럴 색 문자열(#rgb·#rrggbb·rgb()/rgba())을 [r,g,b] 로 파싱. 실패/비리터럴 → null.
 * / Parse a literal color string into [r,g,b]; null for non-literal (var()/none/keyword).
 */
export function parseColor(input: string): [number, number, number] | null {
  const s = input.trim().toLowerCase();
  if (s === '' || s === 'none' || s === 'transparent' || s.startsWith('var(')) return null;
  // #rgb / #rrggbb
  if (s[0] === '#') {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      return Number.isNaN(r + g + b) ? null : [r, g, b];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return Number.isNaN(r + g + b) ? null : [r, g, b];
    }
    return null;
  }
  // rgb()/rgba()
  const m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if ([r, g, b].some(n => Number.isNaN(n))) return null;
    return [r, g, b];
  }
  return null;
}

/** AA 대비 임계(일반 텍스트). / AA contrast threshold (normal text). */
export const AA_CONTRAST = 4.5;

/**
 * 배경색에 대해 AA(≥4.5:1)를 만족하는 텍스트색을 고른다(흑/백 중 대비 큰 쪽).
 * 배경이 비리터럴(var()/none)이면 null → 렌더 레이어가 기존 텍스트색 유지(회귀 0).
 * / Pick an AA-safe (≥4.5:1) text color for a background (black/white, whichever contrasts more).
 * Returns null for non-literal backgrounds so the render layer keeps today's text color.
 *
 * @param background - 배경색(리터럴 또는 var()) / Background color (literal or var())
 * @returns '#000'|'#fff'|null / '#000'|'#fff'|null
 */
export function contrastText(background: string | null | undefined): '#000' | '#fff' | null {
  if (background == null) return null;
  const rgb = parseColor(background);
  if (!rgb) return null;
  const bgL = _luminance(rgb[0], rgb[1], rgb[2]);
  const black = _ratio(bgL, 0);        // 검정 텍스트 대비
  const white = _ratio(bgL, 1);        // 흰색 텍스트 대비
  return black >= white ? '#000' : '#fff';
}

/** AAA 대비 임계(강화 텍스트). / AAA contrast threshold (enhanced text). */
export const AAA_CONTRAST = 7;

/**
 * 자동 선택 텍스트색(흑/백 중 더 대비 큰 쪽)이 목표 임계를 못 넘기는 중간명도 배경(REQ-T5-807 R3)에서
 * 외곽선(text-shadow)/명도반전 폴백이 필요한가. 흑·백 모두 <threshold 이면 true.
 * ※ AA(4.5)에서는 임의 배경도 흑 또는 백 중 하나가 항상 충족하므로 리터럴은 사실상 항상 false(정직한
 *   구조적 성질). 폴백은 강화 임계(AAA 7:1) 또는 색이 제약된 경로에서 의미가 생긴다.
 * / Whether a text-outline/inversion fallback is needed: both black & white text fall below the target
 * threshold on a mid-luminance background. At AA (4.5) one of black/white always suffices for any
 * background, so literals are effectively always false — a fallback becomes meaningful at AAA (7:1).
 *
 * @param background - 배경색 / Background color
 * @param threshold - 목표 대비 임계(기본 AA 4.5) / Target contrast threshold (default AA 4.5)
 * @returns 외곽선 폴백 필요 여부 / Whether an outline fallback is needed
 */
export function needsOutlineFallback(background: string | null | undefined, threshold: number = AA_CONTRAST): boolean {
  if (background == null) return false;
  const rgb = parseColor(background);
  if (!rgb) return false;
  const bgL = _luminance(rgb[0], rgb[1], rgb[2]);
  const best = Math.max(_ratio(bgL, 0), _ratio(bgL, 1));
  return best < threshold;
}
