// ============================================================
// DD-11 §2.1·§9.3 TextureRegistry — 질감 제3축("질감은 크롬의 특권")
// / DD-11 §2.1·§9.3 TextureRegistry — texture as the 3rd axis ("texture is the chrome's privilege").
// ------------------------------------------------------------
// 설계 근거(Why, §9.3·불변식 6·REQ-T1-901/902/024):
//   색·형태 2축 강제는 절반이다. 질감이 명시적 소유처 없으면 인라인 하드코딩으로 샌다
//   (스킨의 backgroundSize 리터럴이 그 증거). 질감을 독립 제3축으로 승격한다:
//   * 소유·접두: `--og-texture-*`. 질감 델타는 색 리터럴을 담지 않고 COLOR 토큰(`--og-texture-ink`)을
//     **참조**만 한다(Rule 2 준수) — 색↔질감 직교.
//   * 정직 상한(§9.5·비협상): `--og-texture-opacity` 상한 **0.1**. 초과 시 등록 게이트가 클램프+경고
//     (텍스트 아래 AA 안전 상한, silent override 아님).
//   * zone 계약(G-ST1, 코어 불변식): 텍스처는 크롬 zone 에만. 데이터/상태/범위/병합/포커스 셀 배경 뒤
//     금지는 AppearanceResolver.texture(zone) 가 **런더 시점** 강제(스킨/테마/질감이 켤 수 없음).
//     TextureRegistry 는 `--og-texture-zone` 힌트만 발행하고 존 강제는 resolver 초크포인트 소유.
//   * seam(실땀, REQ-T1-902): 조각보/stitch 공유 실땀을 `--og-texture-seam` 로 정본화(무광 스티치).
//     **대각 해칭 금지**(사용자가 "이 셀 쓰지 마" 로 오독) — 프리셋 bg 는 결(grain)만, seam 은 외곽.
//   default 는 빈 델타(오늘 = 질감 없음, byte-identical). named 값만 opt-in.
// ============================================================

import { TokenAxis, type TokenDelta } from './AppearanceAxis.js';

/** 질감 축 이름공간(자기 소유 shape 토큰 — 색 `--og-texture-ink` 는 theme 축 소유이므로 제외). / Texture namespace (shape tokens only; the color `--og-texture-ink` belongs to the theme axis). */
export const TEXTURE_TOKENS: ReadonlySet<string> = new Set<string>([
  '--og-texture-bg',
  '--og-texture-size',
  '--og-texture-opacity',
  '--og-texture-seam',
  '--og-texture-zone',
]);

/** `--og-texture-opacity` 정직 상한(§9.5, AA 안전). / Honest cap on texture-opacity (§9.5, AA-safe). */
export const TEXTURE_OPACITY_CAP = 0.1;

/**
 * TextureRegistry — 질감 제3축. 등록 게이트가 texture-opacity 를 0.1 상한으로 클램프한다.
 * named 값은 relayout 을 요구하지 않는다(질감은 배경 페인트만 — 좌표 불변).
 * / TextureRegistry — the 3rd texture axis. The registration gate clamps texture-opacity to ≤0.1.
 *
 * @example
 * textureRegistry.resolve('linen'); // { tokens:{'--og-texture-bg':…,'--og-texture-opacity':'0.06',…}, attr:{name:'data-og-texture',value:'linen'} }
 * textureRegistry.resolve('default'); // { tokens:{} } — byte-identical
 */
export class TextureRegistry extends TokenAxis {
  constructor() {
    super({ id: 'texture', attrName: 'data-og-texture', namespace: TEXTURE_TOKENS });
  }

  /** 정직 상한: --og-texture-opacity > 0.1 → 0.1 클램프(AA 비협상, §9.5). */
  protected override _guardrails(_id: string, delta: TokenDelta): { delta: TokenDelta; warnings: string[] } {
    const out: Record<string, string> = { ...delta };
    const warnings: string[] = [];
    const raw = out['--og-texture-opacity'];
    if (raw != null) {
      const a = parseFloat(String(raw));
      if (!Number.isNaN(a) && a > TEXTURE_OPACITY_CAP) {
        out['--og-texture-opacity'] = String(TEXTURE_OPACITY_CAP);
        warnings.push(
          `--og-texture-opacity ${raw} → ${TEXTURE_OPACITY_CAP} (질감 알파 정직 상한, 텍스트 아래 AA 안전, §9.5)`,
        );
      }
    }
    return { delta: out, warnings };
  }
}

// ─── 내장 질감 프리셋 3종+ (§9.3 — gradient 만; 손그림 결/자수 data-URI 는 defineTexture 격리 레시피) ───
// 색은 `var(--og-texture-ink)` 참조만(Rule 2). zone 기본 chrome(크롬 특권). default 는 등록 안 함.

/** Linen — 리넨 결(교차 해칭 대신 미세 수직/수평 결). / Linen — fine woven grain. */
export const TEXTURE_LINEN: TokenDelta = {
  '--og-texture-bg':
    'repeating-linear-gradient(0deg, rgba(var(--og-texture-ink),0.05) 0 1px, transparent 1px 4px), ' +
    'repeating-linear-gradient(90deg, rgba(var(--og-texture-ink),0.04) 0 1px, transparent 1px 4px)',
  '--og-texture-size': '4px 4px',
  '--og-texture-opacity': '0.06',
  '--og-texture-zone': 'chrome',
};

/** Paper-grain — 종이 그레인(부드러운 점묘 결). / Paper-grain — soft speckle. */
export const TEXTURE_PAPER_GRAIN: TokenDelta = {
  '--og-texture-bg':
    'radial-gradient(rgba(var(--og-texture-ink),0.05) 0.5px, transparent 0.5px)',
  '--og-texture-size': '3px 3px',
  '--og-texture-opacity': '0.05',
  '--og-texture-zone': 'chrome',
};

/** Graph — 모눈(엔지니어링 도면 격자). / Graph — engineering grid. */
export const TEXTURE_GRAPH: TokenDelta = {
  '--og-texture-bg':
    'repeating-linear-gradient(0deg, rgba(var(--og-texture-ink),0.06) 0 1px, transparent 1px 8px), ' +
    'repeating-linear-gradient(90deg, rgba(var(--og-texture-ink),0.06) 0 1px, transparent 1px 8px)',
  '--og-texture-size': '8px 8px',
  '--og-texture-opacity': '0.07',
  '--og-texture-seam': 'var(--og-texture-ink)',
  '--og-texture-zone': 'chrome',
};

/** 내장 질감 카탈로그(default 제외). id → 델타. / Built-in texture catalog (default excluded). */
export const BUILTIN_TEXTURES: ReadonlyArray<readonly [string, TokenDelta]> = [
  ['linen', TEXTURE_LINEN],
  ['paper-grain', TEXTURE_PAPER_GRAIN],
  ['graph', TEXTURE_GRAPH],
];

/** 프로세스 전역 기본 질감 레지스트리(내장 부트스트랩). / Process-global default texture registry. */
export const textureRegistry = new TextureRegistry();
for (const [id, delta] of BUILTIN_TEXTURES) textureRegistry.registerBuiltin(id, delta);
