// ============================================================
// DD-11 §2.1·§9.4 DensityRegistry — 밀도 제4 외관축(compact/comfortable/spacious/gallery + 터치)
// / DD-11 §2.1·§9.4 DensityRegistry — density as the 4th appearance axis.
// ------------------------------------------------------------
// 설계 근거(Why, §9.4·§3.3):
//   밀도는 "말로 0, 토글하면 즉시 이해" 되는 손-발견 기능 → 테마·스킨 옆 세 번째 상시 축.
//   밀도가 바뀌면 **수직 리듬 전체가 동조 재파생**: 행높이 → 폰트크기 → 헤더/푸터 높이.
//   4px 그리드 정합(28/36/40/56)으로 텍스처 반복 간격과 셀 리듬이 어긋나 생기는 모아레 차단
//   (REQ-T2-021). **밀도만 requiresRelayout=true** → DD-02 좌표 SSOT 에 재계산 위임(REQ-T2-017,
//   VirtualScroll 가 스크롤 무결성 보존). default 는 빈 델타(오늘 = --og-row-height:32 유지, byte-identical).
//   `pointer:coarse` 터치 부스트는 44px 하한 클램프(REQ-T2-018, 히트타깃 단일 소스).
//   이름공간 `--og-density-*`(+파생 `--og-font-size`) 격리 — 색·형태·질감 토큰 유입은 등록 거부.
// ============================================================

import { TokenAxis, type TokenDelta } from './AppearanceAxis.js';

/** 밀도 축 이름공간(자기 소유 토큰 — 축 오염 검증용). / Density namespace (own tokens — for pollution check). */
export const DENSITY_TOKENS: ReadonlySet<string> = new Set<string>([
  '--og-density-row-height',
  '--og-density-header-height',
  '--og-density-footer-height',
  '--og-font-size', // 파생(§9.1 "밀도-타이포 동조") — 밀도가 타이포를 재파생
  '--og-density-touch-min',
]);

/** 터치 히트타깃 하한(px, REQ-T2-018). / Touch hit-target floor (px). */
export const TOUCH_MIN_PX = 44;

/**
 * DensityRegistry — 밀도 축(4값 + 터치). named 값은 relayout 을 요구한다(density 전용).
 * 터치 부스트는 row/header/footer 를 44px 하한으로 클램프하고 그 사실을 경고로 알린다(silent 아님).
 * / DensityRegistry — the density axis (4 values + touch). Named values require relayout.
 *
 * @example
 * densityRegistry.resolve('compact'); // { tokens:{'--og-density-row-height':'28px',…}, attr:{name:'data-og-density',value:'compact'}, requiresRelayout:true }
 * densityRegistry.resolve('default'); // { tokens:{} } — byte-identical, attr 생략
 */
export class DensityRegistry extends TokenAxis {
  constructor() {
    super({ id: 'density', attrName: 'data-og-density', namespace: DENSITY_TOKENS, requiresRelayout: true });
  }

  /** 터치 부스트: row/header/footer 픽셀을 44px 하한으로 클램프(가시 히트타깃 비협상, REQ-T2-018). */
  protected override _guardrails(_id: string, delta: TokenDelta): { delta: TokenDelta; warnings: string[] } {
    const out: Record<string, string> = { ...delta };
    const warnings: string[] = [];
    for (const key of ['--og-density-row-height', '--og-density-header-height', '--og-density-footer-height']) {
      const raw = out[key];
      if (raw == null) continue;
      const px = parseFloat(String(raw));
      if (!Number.isNaN(px) && px < TOUCH_MIN_PX && _id.includes('touch')) {
        out[key] = `${TOUCH_MIN_PX}px`;
        warnings.push(`${key} ${raw} → ${TOUCH_MIN_PX}px (터치 히트타깃 최소 44px, REQ-T2-018)`);
      }
    }
    return { delta: out, warnings };
  }
}

// ─── 내장 밀도 델타 (§9.4 — 4px 그리드 정합, 행높이→폰트 동조) ───
// default 는 등록하지 않는다(빈 델타 = 오늘의 --og-row-height:32 유지, byte-identical).
// 파생: 행높이 → 폰트(28→12 / 36→13 / 40→14 / 56→15). 헤더는 행+2, 푸터는 행과 동일 기준.

/** Compact — 고밀도 엔터프라이즈(28px, 12px). / Compact — high-density enterprise. */
export const DENSITY_COMPACT: TokenDelta = {
  '--og-density-row-height': '28px',
  '--og-density-header-height': '30px',
  '--og-density-footer-height': '28px',
  '--og-font-size': '12px',
};

/** Comfortable — 균형(36px, 13px). / Comfortable — balanced. */
export const DENSITY_COMFORTABLE: TokenDelta = {
  '--og-density-row-height': '36px',
  '--og-density-header-height': '38px',
  '--og-density-footer-height': '36px',
  '--og-font-size': '13px',
};

/** Spacious — 여백 넉넉(40px, 14px). / Spacious — roomy. */
export const DENSITY_SPACIOUS: TokenDelta = {
  '--og-density-row-height': '40px',
  '--og-density-header-height': '44px',
  '--og-density-footer-height': '40px',
  '--og-font-size': '14px',
};

/** Gallery — 카드형 대형(56px, 15px). / Gallery — card-like large. */
export const DENSITY_GALLERY: TokenDelta = {
  '--og-density-row-height': '56px',
  '--og-density-header-height': '48px',
  '--og-density-footer-height': '48px',
  '--og-font-size': '15px',
};

/** Compact-touch — compact 지만 44px 하한(터치, §3.3·REQ-T2-018). / Compact but 44px-floored (touch). */
export const DENSITY_COMPACT_TOUCH: TokenDelta = {
  '--og-density-row-height': '44px',
  '--og-density-header-height': '44px',
  '--og-density-footer-height': '44px',
  '--og-font-size': '13px',
};

/** 내장 밀도 카탈로그(default 제외 — default 는 빈 델타). id → 델타. / Built-in density catalog (default excluded). */
export const BUILTIN_DENSITIES: ReadonlyArray<readonly [string, TokenDelta]> = [
  ['compact', DENSITY_COMPACT],
  ['comfortable', DENSITY_COMFORTABLE],
  ['spacious', DENSITY_SPACIOUS],
  ['gallery', DENSITY_GALLERY],
  ['compact-touch', DENSITY_COMPACT_TOUCH],
];

/** 프로세스 전역 기본 밀도 레지스트리(내장 부트스트랩). / Process-global default density registry. */
export const densityRegistry = new DensityRegistry();
for (const [id, delta] of BUILTIN_DENSITIES) densityRegistry.registerBuiltin(id, delta);
