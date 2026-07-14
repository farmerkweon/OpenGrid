// ============================================================
// DD-05 S2c-1 CF 렌더 브리지 — 헤드리스 VisualSpec[] → 실 DOM 적용기(top-level core, 헤드리스 아님).
// / DD-05 S2c-1 CF render bridge — applies headless VisualSpec[] onto real DOM (top-level core; NOT headless).
// ------------------------------------------------------------
// CF 하위도메인(cf/**)은 DOM 을 만지지 않는다(VisualSpec 만 산출·§1 헤드리스 계약). DOM 적용은 렌더층이
// 소유한다 — 이 파일이 그 유일한 경계다. 호스트 CSS 격리를 위해 모든 시각은 인라인 스타일로 강제하며
// (호스트 전역 CSS 가 .og-cf-* 를 깨뜨려도 안전), 접근성 텍스트 쌍둥이(ariaSummary)는 셀 aria-label 에
// append 한다. 재렌더 안전: 적용 전 이전 CF 잔재(.og-cf-bar/.og-cf-icon + CF 소유 인라인 스타일)를 제거한다.
// ============================================================

import type { VisualSpec } from './cf/encoders.js';

/** CF 가 셀에 삽입하는 요소/스타일 표식(재렌더 잔재 정리 키). / Marker for CF-inserted nodes/styles. */
const CF_BAR_CLASS = 'og-cf-bar';
const CF_ICON_CLASS = 'og-cf-icon';
const CF_FLAG = 'ogCf';

/** shape → 형태 유니코드 글리프(색과 독립적인 형태 부호, §9.2 이중부호화). / Shape → dual-coding glyph. */
function glyphChar(shape: 'circle' | 'triangleUp' | 'triangleDown'): string {
  return shape === 'triangleUp' ? '▲' : shape === 'triangleDown' ? '▼' : '●';
}

/** 이전 CF 잔재 제거(재렌더/재적용 시 중복 방지). / Strip prior CF residue (bars/icons + CF-owned inline styles). */
function clearCF(cellEl: HTMLElement): void {
  for (const child of Array.from(cellEl.children)) {
    if (child.classList.contains(CF_BAR_CLASS) || child.classList.contains(CF_ICON_CLASS)) {
      child.remove();
    }
  }
  if (cellEl.dataset[CF_FLAG]) {
    // CF 가 직접 세팅한 인라인 스타일만 리셋(포뮬러 마커 backgroundImage 등 타 기능 스타일 불침범).
    cellEl.style.backgroundColor = '';
    cellEl.style.color = '';
    cellEl.style.textShadow = '';
    delete cellEl.dataset[CF_FLAG];
  }
}

/**
 * VisualSpec[] 를 셀 DOM 에 적용한다(데이터바·히트맵·아이콘셋·잉크·aria 텍스트 쌍둥이).
 * cf/ 가 산출한 순수 스펙을 렌더층에서 물질화하는 유일 진입점. 호스트 CSS 격리 위해 전부 인라인 스타일.
 * / Apply VisualSpec[] onto a cell (data-bar/heatmap/icon-set/ink/aria text-twin). The sole point
 * that materializes cf/'s pure specs in the render layer. All-inline styles for host-CSS isolation.
 *
 * @param cellEl - 대상 셀 요소 / Target cell element
 * @param specs - CFEngine.paintFor 산출 시각 스펙 배열 / The VisualSpec array from CFEngine.paintFor
 * @param cellW - 셀 콘텐츠 폭(px) — 데이터바 길이 산출 / Cell content width (px) for bar length
 * @param cellH - 셀 콘텐츠 높이(px) / Cell content height (px)
 */
export function applyVisualSpecs(cellEl: HTMLElement, specs: VisualSpec[], cellW: number, _cellH: number): void {
  clearCF(cellEl);
  if (specs.length === 0) return;

  let touched = false;
  const ariaParts: string[] = [];

  for (const spec of specs) {
    if (spec.ariaSummary) ariaParts.push(spec.ariaSummary);

    // ── fill(배경) — 히트맵(from 없음, 전체 채움) vs 데이터바(from 있음, 비율 막대) ──
    if (spec.fill) {
      const { color, from, ratio } = spec.fill;
      if (from === undefined) {
        // 히트맵/scale: 셀 배경 전체 채움.
        cellEl.style.backgroundColor = color;
      } else {
        // 데이터바: 셀 안 비율 막대(텍스트 아래 z-order). 인라인 스타일로 호스트 CSS 격리.
        cellEl.style.position = 'relative';
        const bar = document.createElement('div');
        bar.className = CF_BAR_CLASS;
        const width = Math.max(0, Math.min(1, ratio)) * cellW;
        bar.style.position = 'absolute';
        bar.style.top = '0';
        bar.style.bottom = '0';
        bar.style.width = `${width}px`;
        bar.style.background = color;
        // 0기준 음수는 오른쪽 정렬, 그 외 왼쪽. right='right' 만 우측 고정.
        if (from === 'right') bar.style.right = '0'; else bar.style.left = '0';
        // 텍스트보다 낮은 z-order(막대는 값의 배경). pointer 무간섭.
        bar.style.zIndex = '0';
        bar.style.pointerEvents = 'none';
        cellEl.insertBefore(bar, cellEl.firstChild);
      }
      // 채움 위 텍스트 색(AA 보증 결과).
      cellEl.style.color = spec.inkColor;
      if (spec.inkOutline) cellEl.style.textShadow = '0 0 2px rgba(255,255,255,0.9), 0 0 2px rgba(255,255,255,0.9)';
      touched = true;
    }

    // ── glyph(아이콘셋) — 색(tint) + 형태(shape) 이중부호화 ──
    if (spec.glyph) {
      const { role, tint, shape } = spec.glyph;
      const icon = document.createElement('span');
      icon.className = CF_ICON_CLASS;
      icon.textContent = glyphChar(shape);
      icon.style.color = tint;
      icon.style.marginRight = '4px';
      icon.style.display = 'inline-block';
      // role 은 aria 로(형태 유니코드는 시각, 의미는 aria 라벨이 담당).
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', role);
      cellEl.insertBefore(icon, cellEl.firstChild);
      touched = true;
    }
  }

  // ── ariaSummary — 기존 aria-label 에 append(텍스트 쌍둥이, 접근성) ──
  if (ariaParts.length > 0) {
    const prev = cellEl.getAttribute('aria-label') ?? '';
    const twin = ariaParts.join(' · ');
    cellEl.setAttribute('aria-label', prev ? `${prev} — ${twin}` : twin);
    touched = true;
  }

  if (touched) cellEl.dataset[CF_FLAG] = '1';
}
