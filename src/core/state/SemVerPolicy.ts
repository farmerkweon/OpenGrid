// ============================================================
// DD-09 §2.5.1 SemVerPolicy — 저장포맷 semver 로드 정책(5분기 라우팅, 조용한 오해석 0)
// / DD-09 §2.5.1 SemVerPolicy — save-format semver load policy (5-branch routing, zero silent misread).
// REQ: TX-892 · T9-808 · T9-807
// ------------------------------------------------------------
// 로드된 schemaVersion 과 런타임 CURRENT 를 비교해 정확히 한 갈래로 라우팅한다:
//   같은 major & (minor/patch ≤ CURRENT) → load(하위호환)
//   같은 major & minor > CURRENT          → tolerant(미지 섹션 opaque 보존)
//   major < CURRENT                        → migrate(마이그레이션 체인)
//   major > CURRENT                        → reject(미래 major, 오해석 위험)
//   파싱 실패                              → reject
// 거부는 미래 major·파싱실패 뿐(불변식 §5) — 같은 major 안에서는 절대 문서를 잃지 않는다.
// ============================================================

/** 'MAJOR.MINOR.PATCH' 만 허용하는 브랜드 문자열(파싱 실패 = 거부 대상). / Branded 'MAJOR.MINOR.PATCH'. */
export type SemVer = string & { readonly __brand: 'SemVer' };

/** 검증 없이 브랜드 부여(호출자 책임). 실검증은 parse/classify 가 한다. / Brand without validation. */
export function asSemVer(s: string): SemVer {
  return s as SemVer;
}

export interface ParsedSemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** classify 결과 — 5분기. / classify result — 5 branches. */
export type Classification =
  | { readonly kind: 'load' }
  | { readonly kind: 'tolerant'; readonly unknownSections: string[] }
  | { readonly kind: 'migrate'; readonly fromMajor: number }
  | { readonly kind: 'reject'; readonly reason: string };

/** classify 부가 입력(관용 로드 시 미지 섹션 산출). / Extra input for classify (unknown-section derivation). */
export interface ClassifyContext {
  readonly loadedSections?: readonly string[];
  readonly knownSections?: readonly string[];
}

/** semver 비교 커널(단일 소유 — 봉투/커맨드 payloadVersion 공용). / semver comparison kernel. */
export interface SemVerPolicy {
  parse(s: string): ParsedSemVer | null;
  classify(loaded: string, current: string, ctx?: ClassifyContext): Classification;
}

/** §2.5.1 표를 구현한 기본 정책. / Default policy implementing the §2.5.1 table. */
export class DefaultSemVerPolicy implements SemVerPolicy {
  parse(s: string): ParsedSemVer | null {
    if (typeof s !== 'string') return null;
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s.trim());
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
  }

  classify(loaded: string, current: string, ctx?: ClassifyContext): Classification {
    const L = this.parse(loaded);
    const C = this.parse(current);
    if (!L) return { kind: 'reject', reason: `schemaVersion 형식 오류: '${loaded}'` };
    if (!C) return { kind: 'reject', reason: `CURRENT 형식 오류: '${current}'` };

    if (L.major > C.major) {
      return {
        kind: 'reject',
        reason: `이 문서는 상위 버전(major ${L.major})에서 저장됨. 최신 빌드 필요.`,
      };
    }
    if (L.major < C.major) {
      return { kind: 'migrate', fromMajor: L.major };
    }
    // 같은 major.
    if (L.minor > C.minor) {
      const known = new Set(ctx?.knownSections ?? []);
      const unknownSections = (ctx?.loadedSections ?? []).filter((k) => !known.has(k));
      return { kind: 'tolerant', unknownSections };
    }
    // minor ≤ CURRENT (patch 는 무관) → 하위호환 로드.
    return { kind: 'load' };
  }
}
