// ============================================================
// SPEC §2.1·§2.4 TypographyRegistry — 타이포그래피 제5축("서체는 데이터의 목소리")
// / SPEC §2.1·§2.4 TypographyRegistry — typography as the 5th appearance axis.
// ------------------------------------------------------------
// 설계 근거(Why, SPEC §0 D-1/D-2·§2.1·§2.4):
//   색·형태·밀도·질감 네 축을 세워 놓고 서체만 무주공산으로 두면, base.css 의 폰트 하드코딩이
//   그대로 "아무도 소유하지 않은 전역 상태" 가 된다. 타이포를 제5축으로 승격해 소유처를 못박는다.
//   * 소유 토큰 9개(TYPOGRAPHY_TOKENS). `--og-font-family`·`--og-header-font-weight`·
//     `--og-header-letter-spacing` 은 base.css 의 기존 무주공산 토큰을 **이름 그대로 입양**한다
//     (하위호환 — 오늘의 CSS 가 그대로 유효).
//   * **`--og-font-size` 와 `--og-line-height` 는 가져오지 않는다.** 둘 다 density 소유다
//     (§9.1 "밀도-타이포 동조" 계약). 이를 어기면 OpenGrid.setDensity() 가 DENSITY_TOKENS 를
//     일괄 removeProperty 할 때 타이포 설정이 조용히 지워진다 — 밀도를 안 바꾸면 재현되지 않는,
//     디버깅이 비싼 종류의 결함이다.
//   * 광학 크기(작을수록 벌리고 굵히기)는 밀도 축을 **읽기만** 한다:
//     `[data-og-typography="x"][data-og-density="compact"]` 복합 셀렉터 — CSS 소유, 토큰 소유 아님.
//   * 정직 가드 2종(§2.4): ①음수 자간 × CJK 스택 → normal 클램프+경고(한글 음절이 뭉갠다)
//     ②서체 스택의 `url(`/`@font-face` → throw(웹폰트 무다운로드 보증 = 제로 의존성 약속).
//   default 는 빈 델타 + 속성 미부착(byte-identical). named 값만 opt-in.
//   **헤드리스·순수.** DOM 을 만지지 않는다(DOM 반영은 `src/typography/` 플러그인 경계 소유).
//   arch:check 의 HEADLESS_DIRS(`src/core/appearance/`) 대상.
// ============================================================

import { TokenAxis, type TokenDelta } from './AppearanceAxis.js';

/**
 * 타이포그래피 축 이름공간(자기 소유 토큰 9개 — 축 섞임 검증용).
 *
 * `--og-font-size`·`--og-line-height` 는 **의도적으로 빠져 있다**. 둘은 density 축 소유다.
 *
 * Typography namespace (the 9 own tokens — used for the axis-pollution check).
 *
 * `--og-font-size` and `--og-line-height` are deliberately absent: they belong to the density axis.
 *
 * タイポグラフィ軸の名前空間(自分が所有するトークン9個 — 軸の混在を検査するために使います)。
 *
 * `--og-font-size`・`--og-line-height` は**意図的に外してあります**。どちらも密度軸の所有です。
 *
 * 排版轴的命名空间(自己所有的令牌9个 — 用于轴混用检查)。
 *
 * `--og-font-size`、`--og-line-height` 是**有意排除的**。两者都归密度轴所有。
 */
export const TYPOGRAPHY_TOKENS: ReadonlySet<string> = new Set<string>([
  '--og-font-family',
  '--og-font-weight',
  '--og-letter-spacing',
  '--og-header-font-family',
  '--og-header-font-weight',
  '--og-header-letter-spacing',
  '--og-font-variant-numeric',
  '--og-num-font-family',
  '--og-prose-line-height',
]);

/**
 * 컨테이너에 붙는 축 속성명.
 *
 * The container attribute name for this axis.
 *
 * コンテナに付く軸の属性名。
 *
 * 加在容器上的轴属性名。
 */
export const TYPOGRAPHY_ATTR = 'data-og-typography';

/** 서체 스택을 담는 토큰(웹폰트 가드·CJK 판정 대상). / Tokens that carry a font stack. */
const FAMILY_TOKENS = ['--og-font-family', '--og-header-font-family', '--og-num-font-family'] as const;

/** 자간 토큰(음수 × CJK 가드 대상). / Letter-spacing tokens (negative × CJK guard). */
const TRACKING_TOKENS = ['--og-letter-spacing', '--og-header-letter-spacing'] as const;

/** 웹폰트 다운로드 흔적(무다운로드 보증 위반). / Traces of a web-font download (breaks the no-download guarantee). */
const WEBFONT_RE = /url\s*\(|@font-face/i;

/**
 * CJK 서체 판정 — 이름에 CJK 신호가 있거나 값 자체에 한글/한자/가나 글리프가 있으면 CJK 스택으로 본다.
 * (실제 폰트 메트릭은 jsdom 에 없으므로 이름 기반 판정이 최선이다 — SPEC §5.2 정직 고지.)
 */
const CJK_FONT_RE =
  /(hangul|gothic|myeongjo|batang|dotum|gulim|malgun|pretendard|nanum|d2coding|noto\s*sans\s*(kr|jp|sc|tc|cjk)|source\s*han|apple\s*sd|hiragino|yu\s*gothic|meiryo|ms\s*(p?)(gothic|mincho)|yahei|pingfang|jhenghei|simsun|songti|cjk)|[가-힣぀-ヿ一-鿿]/i;

/**
 * 이름공간 밖 토큰의 소유 축을 접두사로 추정한다(오류 메시지 품질 전용).
 *
 * 판정 자체는 `TYPOGRAPHY_TOKENS` 정확 조회가 하고, 이 함수는 "그럼 누구 거냐" 를 알려줄 뿐이라
 * 오탐이 계약을 흔들지 않는다. 다른 축 모듈을 import 하지 않는 이유는 플러그인 엔트리
 * (`src/typography/`)가 스킨/밀도/질감 모듈을 통째로 끌어오지 않게 하기 위함이다.
 *
 * Guess the owning axis from the token prefix — for error-message quality only.
 *
 * The verdict itself comes from the exact `TYPOGRAPHY_TOKENS` lookup; this only answers
 * "then whose is it?", so a mis-guess cannot weaken the contract. The other axis modules are
 * deliberately not imported so the plugin entry does not drag them into its bundle.
 */
function guessOwnerAxis(key: string): string {
  if (key === '--og-font-size' || key === '--og-line-height' || key.startsWith('--og-density-')) {
    return '밀도(data-og-density) — 행높이·글자크기는 밀도가 소유합니다(§9.1 밀도-타이포 동조 계약)';
  }
  if (key.startsWith('--og-texture-')) return '질감(data-og-texture)';
  if (
    /^--og-(radius|border|elevation|focus|cell-padding|divider|scrollbar|icon|transition|container-radius|row-accent)/.test(key)
  ) {
    return '형태(data-og-skin)';
  }
  return '색(data-og-theme) 또는 미등록 토큰';
}

/**
 * assertTypographyOnly — 타이포 델타가 색/형태/밀도/질감 토큰을 담지 않는지 검사(4축 대칭).
 *
 * `assertColorOnly`(ThemeMetaRegistry)·`assertFormOnly`(SkinRegistry)의 세 번째 대칭항이다.
 * 각 축은 자기 이름공간만 낸다는 불변식 1 을 타이포 방향으로도 기계강제한다.
 *
 * assertTypographyOnly — rejects color/form/density/texture tokens in a typography delta.
 *
 * The third symmetric counterpart to `assertColorOnly` and `assertFormOnly`: invariant 1
 * (each axis emits only its own namespace) is now mechanically enforced in the typography
 * direction too.
 *
 * assertTypographyOnly — タイポグラフィのデルタが色/形状/密度/質感のトークンを含まないかを検査します
 * (4軸の対称)。
 *
 * `assertColorOnly`(ThemeMetaRegistry)・`assertFormOnly`(SkinRegistry)に続く3つめの対称項です。
 * 各軸は自分の名前空間だけを出すという不変条件1を、タイポグラフィの方向でも機械的に強制します。
 *
 * assertTypographyOnly — 检查排版增量是否含有颜色/形状/密度/质感的令牌(4轴的对称)。
 *
 * 它是 `assertColorOnly`(ThemeMetaRegistry)、`assertFormOnly`(SkinRegistry)之后的第三个对称项。
 * 把「每个轴只发出自己的命名空间」这条不变式1，在排版方向上也机械强制。
 *
 * @param id - 타이포 프리셋 id
 *
 * Typography preset id
 *
 * タイポグラフィプリセット id
 *
 * 排版预设 id
 * @param delta - 검사할 타이포 델타
 *
 * Typography delta to validate
 *
 * 検査するタイポグラフィのデルタ
 *
 * 要检查的排版增量
 * @throws 이름공간 밖 토큰이 있으면 Error
 *
 * Throws if a token outside the namespace is present
 *
 * 名前空間の外のトークンがあれば Error
 *
 * 有命名空间之外的令牌时抛出 Error
 * @example
 * assertTypographyOnly('my-typo', { '--og-font-size': '12px' }); // throws — --og-font-size 는 density 소유
 */
export function assertTypographyOnly(id: string, delta: TokenDelta): void {
  for (const key of Object.keys(delta)) {
    if (TYPOGRAPHY_TOKENS.has(key)) continue;
    throw new Error(
      `[TypographyRegistry] 타이포 "${id}" 의 토큰 "${key}" 은 타이포 축 이름공간이 아닙니다. ` +
      `이 토큰은 ${guessOwnerAxis(key)} 소유입니다. ` +
      `타이포(서체) 델타는 서체·웨이트·자간·숫자 변형만 담을 수 있습니다(축 섞임 금지, 불변식 1).`,
    );
  }
}

/**
 * TypographyRegistry — 타이포그래피 제5축. 등록 게이트가 정직 가드 2종을 집행한다.
 *
 * named 값은 relayout 을 요구하지 않는다(서체 교체는 CSS 재페인트 — 행높이는 density 소유라 좌표 불변).
 *
 * TypographyRegistry — the 5th (typography) axis. The registration gate enforces two honesty guards.
 *
 * Named values do not require relayout: swapping a face only repaints, and row height belongs to density.
 *
 * TypographyRegistry — タイポグラフィ第5軸。登録ゲートが2種類の正直ガードを執行します。
 *
 * named の値は relayout を要求しません(書体の入れ替えは CSS の再ペイントで、行の高さは密度の所有なので
 * 座標は変わりません)。
 *
 * TypographyRegistry — 排版第5轴。注册关卡执行两种如实防护。
 *
 * named 的值不要求 relayout(换字体只是 CSS 重绘，行高归密度所有，所以坐标不变)。
 *
 * @example
 * typographyRegistry.resolve('ledger');  // { tokens:{'--og-font-family':…,'--og-font-variant-numeric':'tabular-nums slashed-zero'}, attr:{name:'data-og-typography',value:'ledger'} }
 * typographyRegistry.resolve('default'); // { tokens:{} } — 속성 미부착, byte-identical
 */
export class TypographyRegistry extends TokenAxis {
  constructor() {
    super({ id: 'typography', attrName: TYPOGRAPHY_ATTR, namespace: TYPOGRAPHY_TOKENS });
  }

  /**
   * 등록 게이트에 축 섞임 검사를 선행시킨다(`assertFormOnly`·`assertColorOnly` 와 동형 배선).
   *
   * 登録ゲートの手前で軸の混在を検査します(`assertFormOnly`・`assertColorOnly` と同じ形の配線)。
   *
   * 在注册关卡之前先做轴混用检查(与 `assertFormOnly`、`assertColorOnly` 同形的接线)。
   */
  override registerBuiltin(id: string, delta: TokenDelta): void {
    assertTypographyOnly(id, delta);
    super.registerBuiltin(id, delta);
  }

  /**
   * 사용자 정의 등록. 축 섞임은 throw, 정직 가드는 클램프+경고.
   *
   * ユーザー定義の登録。軸の混在は throw、正直ガードはクランプ+警告。
   *
   * 用户自定义的注册。轴混用 throw，如实防护则钳制 + 警告。
   */
  override define(id: string, delta: TokenDelta): { delta: TokenDelta; warnings: string[] } {
    assertTypographyOnly(id, delta);
    return super.define(id, delta);
  }

  /**
   * 정직 가드 2종(SPEC §2.4).
   *
   * ① `url(`/`@font-face` 가 섞인 서체 스택 → **throw**. 축은 "시스템에 이미 있는 서체를 고르는 일"만
   *    소유한다. 웹폰트를 내려받는 순간 제로 의존성 약속이 깨지고, 폰트가 뜨기 전 렌더가 흔들린다.
   * ② 음수 자간 × CJK 스택 → `normal` 클램프 + 경고. 음수 트래킹은 라틴에서는 멀쩡해 보이지만
   *    한글 음절과 한자 자소를 겹쳐 뭉갠다 — 개발 중에는 보이지 않는 종류의 손상이다.
   *    silent override 가 아니라 경고를 남긴다(TextureRegistry 의 opacity 클램프와 동형).
   */
  protected override _guardrails(_id: string, delta: TokenDelta): { delta: TokenDelta; warnings: string[] } {
    const out: Record<string, string> = { ...delta };
    const warnings: string[] = [];

    // ① 웹폰트 무다운로드 보증 — 비협상(throw).
    for (const key of FAMILY_TOKENS) {
      const raw = out[key];
      if (raw != null && WEBFONT_RE.test(String(raw))) {
        throw new Error(
          `[TypographyRegistry] 타이포 "${_id}" 토큰 "${key}" 에 웹폰트 선언(url()/@font-face)이 있습니다. ` +
          `타이포 축은 시스템에 이미 있는 서체를 고르는 일만 소유하며 폰트를 내려받지 않습니다` +
          `(제로 의존성·무다운로드 보증). 서체 이름만 스택으로 나열하세요.`,
        );
      }
    }

    // ② 음수 자간 × CJK 스택 — normal 클램프 + 경고.
    const stack = FAMILY_TOKENS.map((k) => out[k] ?? '').join(',');
    const hasCJK = CJK_FONT_RE.test(stack);
    if (hasCJK) {
      for (const key of TRACKING_TOKENS) {
        const raw = out[key];
        if (raw == null) continue;
        const n = parseFloat(String(raw));
        if (!Number.isNaN(n) && n < 0) {
          out[key] = 'normal';
          warnings.push(
            `${key} ${raw} → normal (음수 자간은 한글 음절을 뭉갠다 — 서체 스택에 CJK 폴백이 있습니다, SPEC §2.4)`,
          );
        }
      }
    }

    return { delta: out, warnings };
  }
}

// ─── 내장 타이포 프리셋 7종 (값 SSOT = sessions/theme-typo-2026-08/proto/typography-new.css) ───
// default 는 등록하지 않는다(빈 델타 = 오늘의 base.css 스택 유지, byte-identical).
// ⚠ 서체 스택은 전부 "시스템에 있으면 잡고 없으면 우아하게 내려앉는" 기회적 스택이다. @font-face 0.

/** ui — UI 그로테스크(권장 기본). / ui — UI grotesque (recommended default). */
export const TYPOGRAPHY_UI: TokenDelta = {
  '--og-font-family':
    'Inter, "Inter Variable", "Inter var", -apple-system, BlinkMacSystemFont, ' +
    '"Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, ' +
    'Pretendard, "Pretendard Variable", "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", ' +
    '"Noto Sans KR", "Nanum Gothic", "Hiragino Sans", "Yu Gothic UI", Meiryo, ' +
    '"Microsoft YaHei", "PingFang SC", sans-serif',
  '--og-font-weight': '400',
  '--og-letter-spacing': 'normal',
  '--og-header-font-weight': '600',
  // 0.025em → 0.014em: 기존 헤더 트래킹이 한글 헤더를 벌려 놓던 결함 교정.
  '--og-header-letter-spacing': '0.014em',
  '--og-font-variant-numeric': 'tabular-nums',
};

/** ledger — 회계 원장(0↔O 오독 차단). / ledger — accounting ledger (blocks 0↔O misreads). */
export const TYPOGRAPHY_LEDGER: TokenDelta = {
  '--og-font-family':
    '"IBM Plex Sans", "Source Sans 3", "Source Sans Pro", Inter, ' +
    '"Segoe UI Variable Text", "Segoe UI", system-ui, Pretendard, "Apple SD Gothic Neo", ' +
    '"Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif',
  '--og-num-font-family':
    '"IBM Plex Mono", "SF Mono", "Cascadia Mono", "Roboto Mono", Consolas, ' +
    '"DejaVu Sans Mono", "Liberation Mono", monospace',
  '--og-font-weight': '400',
  '--og-letter-spacing': 'normal',
  '--og-header-font-weight': '700',
  '--og-header-letter-spacing': '0.02em',
  '--og-font-variant-numeric': 'tabular-nums slashed-zero',
};

/** terminal — 터미널/코드. / terminal — terminal & code. */
export const TYPOGRAPHY_TERMINAL: TokenDelta = {
  '--og-font-family':
    '"JetBrains Mono", "Cascadia Code", "Cascadia Mono", "SF Mono", Menlo, Monaco, Consolas, ' +
    '"Liberation Mono", "DejaVu Sans Mono", D2Coding, "D2Coding ligature", "Nanum Gothic Coding", ' +
    '"Noto Sans Mono CJK KR", "Noto Sans Mono CJK JP", monospace',
  '--og-font-weight': '400',
  // 음수 금지 — D2Coding 한글 음절이 겹친다(가드가 아니라 값 자체로 지킨다).
  '--og-letter-spacing': 'normal',
  '--og-header-font-weight': '600',
  '--og-header-letter-spacing': '0.01em',
  '--og-font-variant-numeric': 'tabular-nums slashed-zero',
};

/**
 * dense-scan — 고밀도 스캔(compact 밀도의 짝).
 *
 * 광학 크기 보정(밀도별 웨이트·자간 재조정)은 CSS 복합 셀렉터가 소유한다 — 이 델타는 기준값만 담는다.
 *
 * dense-scan — high-density scanning (partner of the compact density).
 *
 * Optical-size correction per density lives in CSS compound selectors; this delta carries the base values only.
 */
export const TYPOGRAPHY_DENSE_SCAN: TokenDelta = {
  '--og-font-family':
    'Inter, "Inter Variable", "Segoe UI Variable Small", "Segoe UI", system-ui, ' +
    '-apple-system, BlinkMacSystemFont, Roboto, Pretendard, "Pretendard Variable", ' +
    '"Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", "Noto Sans KR", sans-serif',
  '--og-font-weight': '430',
  '--og-letter-spacing': '0.01em',
  '--og-header-font-weight': '640',
  '--og-header-letter-spacing': '0.028em',
  '--og-font-variant-numeric': 'tabular-nums',
};

/** humanist — 휴머니스트(장시간·저시력). 7종 중 유일하게 헤더 서체를 분리한다. / humanist — long-session & low-vision; the only preset that splits the header face. */
export const TYPOGRAPHY_HUMANIST: TokenDelta = {
  '--og-font-family':
    'Verdana, Tahoma, "DejaVu Sans", "Bitstream Vera Sans", "Lucida Grande", "Segoe UI", ' +
    'system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", "Noto Sans KR", ' +
    '"Nanum Gothic", sans-serif',
  '--og-header-font-family':
    '"Segoe UI", system-ui, -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  '--og-font-weight': '400',
  '--og-letter-spacing': 'normal',
  '--og-header-font-weight': '600',
  '--og-header-letter-spacing': '0.02em',
  '--og-font-variant-numeric': 'tabular-nums',
  '--og-prose-line-height': '1.55',
};

/** hangul-first — 한글 우선(국문 헤더에 트래킹을 주지 않는다). / hangul-first — Korean-first; no tracking on Korean headers. */
export const TYPOGRAPHY_HANGUL_FIRST: TokenDelta = {
  '--og-font-family':
    'Pretendard, "Pretendard Variable", "Pretendard JP", "Apple SD Gothic Neo", ' +
    '"Noto Sans KR", "Source Han Sans KR", "Malgun Gothic", "맑은 고딕", "Nanum Gothic", ' +
    'Dotum, 돋움, system-ui, sans-serif',
  '--og-font-weight': '400',
  '--og-letter-spacing': 'normal',
  '--og-header-font-weight': '600',
  '--og-header-letter-spacing': '0',
  '--og-font-variant-numeric': 'tabular-nums',
};

/**
 * cjk-doc — CJK 문서(한·일·중).
 *
 * 한자 통합(直·骨·類 의 자형이 ko/ja/zh 에서 다름) 분기는 `:lang()` CSS 규칙이 소유한다.
 * `lang` 이 없으면 한국어 자형으로 통일된다 — 예측 가능한 실패.
 *
 * cjk-doc — CJK documents (ko/ja/zh).
 *
 * Han-unification splitting is owned by `:lang()` CSS rules; without a `lang` tag everything
 * falls back to Korean glyph shapes — a predictable failure.
 */
export const TYPOGRAPHY_CJK_DOC: TokenDelta = {
  '--og-font-family':
    '"Noto Sans CJK KR", "Noto Sans KR", "Source Han Sans KR", Pretendard, ' +
    '"Apple SD Gothic Neo", "Malgun Gothic", "Hiragino Sans", "Yu Gothic UI", Meiryo, ' +
    '"Microsoft YaHei", "PingFang SC", "Microsoft JhengHei", "PingFang TC", system-ui, sans-serif',
  '--og-font-weight': '400',
  '--og-letter-spacing': 'normal',
  '--og-header-font-weight': '600',
  '--og-header-letter-spacing': '0',
  '--og-font-variant-numeric': 'tabular-nums',
};

/**
 * 내장 타이포 카탈로그(default 제외 — default 는 빈 델타).
 *
 * Built-in typography catalog (default excluded — default is an empty delta).
 */
export const BUILTIN_TYPOGRAPHIES: ReadonlyArray<readonly [string, TokenDelta]> = [
  ['ui', TYPOGRAPHY_UI],
  ['ledger', TYPOGRAPHY_LEDGER],
  ['terminal', TYPOGRAPHY_TERMINAL],
  ['dense-scan', TYPOGRAPHY_DENSE_SCAN],
  ['humanist', TYPOGRAPHY_HUMANIST],
  ['hangul-first', TYPOGRAPHY_HANGUL_FIRST],
  ['cjk-doc', TYPOGRAPHY_CJK_DOC],
];

/**
 * 프로세스 전역 기본 타이포 레지스트리(내장 부트스트랩).
 *
 * Process-global default typography registry (built-ins bootstrapped).
 *
 * プロセス全体の既定タイポグラフィレジストリ(組み込みをブートストラップ済み)。
 *
 * 进程全局的默认排版注册表(内置已完成引导)。
 */
export const typographyRegistry = new TypographyRegistry();
for (const [id, delta] of BUILTIN_TYPOGRAPHIES) typographyRegistry.registerBuiltin(id, delta);
