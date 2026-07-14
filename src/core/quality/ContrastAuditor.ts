// ============================================================
// DD-13 §2.6 대비 AA 자동 스위트 — ContrastAuditor (REQ-TX-814·813·830)
// / DD-13 §2.6 Contrast AA auto suite.
// 흩어진 대비 검증(15테마 AA·히트맵 텍스트·텍스처 최암부·포커스색)을 단일 순수 계산 스위트로 통합.
// 대비 1차 함수는 palette.ts 단일 소유 — contrastRatio 를 재구현하지 않고 import·위임(크로스컷 §2.2-k).
// 토큰 값은 DD-11(외관)에서 입력받아 판정만(값을 정하지 않음). 순수·헤드리스.
// ============================================================

import { contrastRatio } from '../chart/palette.js';

/** 대비 검사 쌍 — 전경/배경 + 요구 임계. / A contrast pair — fg/bg + required threshold. */
export interface ContrastPair {
  readonly fg: string;    // hex/rgb — 텍스트 또는 UI 요소 색 / text or UI element color
  readonly bg: string;    // 배경(텍스처 위면 최암부 샘플) / background (darkest sample over texture)
  readonly kind: 'bodyText' | 'largeText' | 'uiComponent' | 'graphic';
  readonly context: { theme: string; skin: string; state: string; tokenId: string };
}

/** WCAG 임계: bodyText ≥4.5, large/ui/graphic ≥3.0. 의도적 고정(표준 SSOT). / WCAG minimums. */
export const CONTRAST_MIN: Readonly<Record<ContrastPair['kind'], number>> = Object.freeze({
  bodyText: 4.5,
  largeText: 3.0,
  uiComponent: 3.0,
  graphic: 3.0,
});

/** 단일 쌍 판정. / A single pair verdict. */
export interface ContrastVerdict {
  readonly pair: ContrastPair;
  readonly ratio: number;       // WCAG 상대휘도 공식 산출(palette 위임) / WCAG ratio (delegated)
  readonly required: number;
  readonly status: 'pass' | 'fail';
}

/**
 * 외관 토큰 스냅샷 입력(헤드리스 계약). DD-11 `ResolvedAppearanceSnapshot` 구현 시 대체 import.
 * 감사기는 토큰 값을 만들지 않고, 스냅샷이 선언한 대비 관련 쌍을 순회·판정만 한다.
 * / Appearance token snapshot input (headless contract). To be replaced by DD-11's
 * `ResolvedAppearanceSnapshot` import once implemented.
 */
export interface AppearanceSnapshotLike {
  readonly theme: string;
  readonly skin: string;
  readonly state: string;
  /** 토큰 id → 결정된 색(hex/rgb). / token id → resolved color. */
  readonly colors: Readonly<Record<string, string>>;
  /** 감사 대상 대비 쌍(전경 토큰·배경 토큰·종류). / contrast pairs to audit. */
  readonly pairs: ReadonlyArray<{
    readonly fgToken: string;
    readonly bgToken: string;
    readonly kind: ContrastPair['kind'];
  }>;
}

/**
 * 대비 감사기 — 순수 계산(DOM 무관, 헤드리스).
 * CRC: 색쌍→대비비→판정 | 협력: DD-11(토큰 스냅샷 입력)·ReleaseGate(a11y 게이트)·palette.ts(산식).
 * 불변식: 미달 1건이라도 있으면 실패. 산식 재구현 0 — palette.contrastRatio 위임.
 * / Contrast auditor — pure computation (DOM-agnostic, headless).
 */
export class ContrastAuditor {
  /**
   * 테마×스킨×상태 스냅샷에서 색쌍 인벤토리 생성(누락 토큰=미커버). 결정론 순서.
   * / Build a pair inventory from snapshots (missing token = uncovered). Deterministic order.
   */
  enumeratePairs(snapshots: readonly AppearanceSnapshotLike[]): ContrastPair[] {
    const pairs: ContrastPair[] = [];
    for (const snap of snapshots) {
      for (const p of snap.pairs) {
        const fg = snap.colors[p.fgToken];
        const bg = snap.colors[p.bgToken];
        if (fg === undefined || bg === undefined) continue; // 누락 토큰은 coverageGaps 로 별도 지목
        pairs.push({
          fg,
          bg,
          kind: p.kind,
          context: { theme: snap.theme, skin: snap.skin, state: snap.state, tokenId: p.fgToken },
        });
      }
    }
    return pairs;
  }

  /**
   * 스냅샷의 대비 쌍 중 토큰 값이 누락된 항목 지목(미커버=완결성 위반, TX-830).
   * / Report pairs whose token colors are missing (uncovered = completeness violation).
   */
  coverageGaps(snapshots: readonly AppearanceSnapshotLike[]): string[] {
    const gaps: string[] = [];
    for (const snap of snapshots) {
      for (const p of snap.pairs) {
        if (snap.colors[p.fgToken] === undefined) gaps.push(`${snap.theme}/${snap.skin}/${snap.state}:${p.fgToken}`);
        if (snap.colors[p.bgToken] === undefined) gaps.push(`${snap.theme}/${snap.skin}/${snap.state}:${p.bgToken}`);
      }
    }
    return gaps;
  }

  /** WCAG 2.2 상대휘도 대비비 = palette.contrastRatio 위임(자체 산식 없음). / Delegated ratio. */
  ratio(fg: string, bg: string): number {
    return contrastRatio(fg, bg);
  }

  /** 전수 판정. / Audit every pair. */
  audit(pairs: readonly ContrastPair[]): ContrastVerdict[] {
    return pairs.map(pair => {
      const ratio = this.ratio(pair.fg, pair.bg);
      const required = CONTRAST_MIN[pair.kind];
      return { pair, ratio, required, status: ratio >= required ? 'pass' : 'fail' };
    });
  }

  /** 미달 목록만 필터(리포트용). / Filter to failures only (for reporting). */
  failures(verdicts: readonly ContrastVerdict[]): ContrastVerdict[] {
    return verdicts.filter(v => v.status === 'fail');
  }
}
