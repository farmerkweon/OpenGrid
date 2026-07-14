// ============================================================
// DD-11 §2.2·§9.6 Appearance — 4축 값 애그리게이트 + 조합 유효성 판정 + 재질 서사 프리셋
// / DD-11 §2.2·§9.6 Appearance — the 4-axis value aggregate + combination verdict + material presets.
// ------------------------------------------------------------
// 설계 근거(Why, §2.2·§9.6·REQ-T1-802/038):
//   외관을 산발 옵션이 아니라 **불변식을 가진 단일 값 객체**로 모델링한다. 4축(theme·skin·density·
//   texture)을 하나로 묶고 validate() 가 유효/위험/불가를 **테마 메타 조회로 객관 판정**한다(육안 아님).
//   locale 은 축이 아니다(값 동등성 제외, §R.1) — 무효화 키로만 동승.
//   §9.6 재질 서사: 직교 축이 곱해지면 재질이 태어난다(blueprint/washi/executive). 애그리게이트가
//   상충을 판정한다(executive 금박[광택]×무광 질감 = 재질 문법 충돌 → risky). 데모 매트릭스와
//   공개 API 가 **동일 findings 로** 정직 플래그(§3.5). 헤드리스·순수.
// ============================================================

import { DEFAULT_AXIS_VALUE } from './AppearanceAxis.js';
import type { ThemeMetaRegistry } from './ThemeMetaRegistry.js';

/** 조합 판정 등급. / Combination verdict grade. */
export type AppearanceVerdict = 'ok' | 'risky' | 'invalid';

/** 판정에 필요한 최소 메타 조회 표면(ISP — validate 는 테마 메타만 본다). / Minimal meta-lookup surface for validate. */
export interface AppearanceMetaLookup {
  readonly theme: Pick<ThemeMetaRegistry, 'meta'>;
}

/** 판정 근거 1건(플래그·사유·해소 힌트). / One verdict finding (flag, reason, remedy hint). */
export interface AppearanceFinding {
  /** 관련 축 쌍(또는 단일 축). / The axis pair (or single axis) involved. */
  readonly axes: readonly string[];
  readonly verdict: Exclude<AppearanceVerdict, 'ok'>;
  /** 안정 코드(데모 배지·API 공유). / Stable code (shared by demo badge / API). */
  readonly code: string;
  /** 사람이 읽는 사유 + 해소 힌트. / Human-readable reason + remedy hint. */
  readonly message: string;
}

/**
 * Appearance — 4축 선택의 불변 값 애그리게이트. 동등성은 (theme,skin,density,texture) 튜플.
 * / Appearance — immutable value aggregate of the 4-axis selection. Equality is the tuple.
 *
 * @example
 * const a = new Appearance('dark', 'stitch');
 * a.isDefault;                 // false
 * a.with({ skin: 'sharp' });   // 새 인스턴스(불변)
 */
export class Appearance {
  constructor(
    public readonly theme: string = DEFAULT_AXIS_VALUE,
    public readonly skin: string = DEFAULT_AXIS_VALUE,
    public readonly density: string = DEFAULT_AXIS_VALUE,
    public readonly texture: string = DEFAULT_AXIS_VALUE,
  ) {}

  /** 값 동등성(참조 무관) — 캐시 키·무변경 감지. / Value equality (reference-free). */
  equals(o: Appearance): boolean {
    return (
      this.theme === o.theme &&
      this.skin === o.skin &&
      this.density === o.density &&
      this.texture === o.texture
    );
  }

  /** 한 축만 바꾼 새 인스턴스(불변). / A new instance with one axis changed (immutable). */
  with(patch: Partial<{ theme: string; skin: string; density: string; texture: string }>): Appearance {
    return new Appearance(
      patch.theme ?? this.theme,
      patch.skin ?? this.skin,
      patch.density ?? this.density,
      patch.texture ?? this.texture,
    );
  }

  /** 기본 외관인가(네 축 모두 default = byte-identical 락 경로). / Is this the default appearance? */
  get isDefault(): boolean {
    return (
      this.theme === DEFAULT_AXIS_VALUE &&
      this.skin === DEFAULT_AXIS_VALUE &&
      this.density === DEFAULT_AXIS_VALUE &&
      this.texture === DEFAULT_AXIS_VALUE
    );
  }

  /** 값 튜플 문자열(캐시 키). / Tuple string (cache key). */
  get key(): string {
    return `${this.theme}|${this.skin}|${this.density}|${this.texture}`;
  }

  /**
   * 조합 판정 — 위험/불가 근거 목록(빈 배열 = ok). 테마 메타를 조회해 객관 집행한다(§3.5).
   * / Combination verdict — findings (empty = ok). Objectively enforced via theme-meta lookup.
   *
   * @param reg - 테마 메타 조회 표면 / Theme-meta lookup surface
   * @returns 위험/불가 findings(빈 배열이면 ok) / Findings (empty means ok)
   */
  validate(reg: AppearanceMetaLookup): AppearanceFinding[] {
    const findings: AppearanceFinding[] = [];
    const meta = reg.theme.meta(this.theme);
    const isDark = meta?.dark === true;
    const isTextured = meta?.textured === true;

    // 규칙 1(불가): neumorph 스킨 × 다크 테마 — 저대비 뉴모피즘은 다크에서 판독 불가(§3.5·SkinRegistry §1.3).
    if (this.skin === 'neumorph' && isDark) {
      findings.push({
        axes: ['skin', 'theme'],
        verdict: 'invalid',
        code: 'NEUMORPH_ON_DARK',
        message:
          'neumorph 스킨은 다크 테마 위에서 대비가 무너져 셀 경계가 소실됩니다. ' +
          'allowLowContrastSkins 옵트인 없이는 불가 — 라이트 테마 또는 high-contrast 스킨을 쓰세요.',
      });
    }

    // 규칙 2(위험): stitch 스킨 × 다크 테마 — 어두운 천에 어두운 실이면 실땀 소실(§9.3 texture-ink lift 필요).
    if (this.skin === 'stitch' && isDark) {
      findings.push({
        axes: ['skin', 'theme'],
        verdict: 'risky',
        code: 'STITCH_ON_DARK',
        message:
          'stitch 스킨의 실땀이 다크 테마에서 소실될 수 있습니다. ' +
          '"밝은 실로 어두운 천을 꿰맨다" — --og-texture-ink 를 밝게 lift 한 테마를 페어링하세요.',
      });
    }

    // 규칙 3(위험): 질감(named) × 비질감 테마 — 테마 메타가 질감을 의도하지 않으면 정합 어긋남(§3.5).
    if (this.texture !== DEFAULT_AXIS_VALUE && meta !== undefined && !isTextured) {
      findings.push({
        axes: ['texture', 'theme'],
        verdict: 'risky',
        code: 'TEXTURE_META_MISMATCH',
        message:
          `질감 "${this.texture}" 를 비질감 테마 "${this.theme}" 에 얹었습니다. ` +
          '테마의 --og-texture-ink 가 결을 뒷받침하지 못하면 결이 탁해질 수 있습니다(질감 테마 페어링 권장).',
      });
    }

    // 규칙 4(위험): 광택 스킨(material) × 무광 질감 — 재질 문법 충돌(§9.6 executive 금박 × 무광 seam).
    if (this.skin === 'material' && (this.texture === 'linen' || this.texture === 'paper-grain')) {
      findings.push({
        axes: ['skin', 'texture'],
        verdict: 'risky',
        code: 'MATERIAL_GRAMMAR_CONFLICT',
        message:
          `광택 엘리베이션(material) × 무광 질감("${this.texture}") 은 재질 문법이 충돌합니다. ` +
          '헤어라인을 실땀으로 강등하거나 텍스처 zone 을 chrome-off 로 해소하세요(§9.6).',
      });
    }

    return findings;
  }
}

/** 최악 등급(findings 를 하나의 등급으로 접기 — 데모 배지용). / Worst grade over findings (fold to one badge). */
export function worstVerdict(findings: readonly AppearanceFinding[]): AppearanceVerdict {
  if (findings.some((f) => f.verdict === 'invalid')) return 'invalid';
  if (findings.some((f) => f.verdict === 'risky')) return 'risky';
  return 'ok';
}

/** 재질 프리셋 — 4축 튜플 + 서사(§9.6). / Material preset — 4-axis tuple + narrative. */
export interface MaterialPreset {
  readonly id: string;
  readonly appearance: Appearance;
  /** 재질 서사(왜 이 조합이 물성을 만드는가). / Material narrative (why this combination makes a substance). */
  readonly narrative: string;
}

/**
 * 재질 서사 프리셋(§9.6) — 직교 축이 곱해져 태어나는 재질. 데모/문서·API 공유.
 * / Material-narrative presets (§9.6) — substances born from orthogonal axes multiplied.
 */
export const MATERIAL_PRESETS: ReadonlyArray<MaterialPreset> = [
  {
    id: 'blueprint',
    appearance: new Appearance('blueprint', 'sharp', 'compact', 'graph'),
    narrative:
      'blueprint = 시아노타입 블루(색) × sharp(형태 도면) × 모눈(질감). 엔지니어링 도면의 물성.',
  },
  {
    id: 'washi',
    appearance: new Appearance('washi', 'flat', 'comfortable', 'paper-grain'),
    narrative: 'washi = 한지 웜그레이(색) × flat(형태) × 종이그레인(질감). 부드러운 종이의 물성.',
  },
  {
    id: 'executive',
    appearance: new Appearance('executive', 'material', 'comfortable', DEFAULT_AXIS_VALUE),
    narrative:
      'executive = 근검정(색) × material(형태 금박 헤어라인). 무광 질감을 얹으면 재질 문법 충돌(§9.6).',
  },
];
