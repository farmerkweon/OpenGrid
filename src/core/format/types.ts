// ============================================================
// DD-04 포맷터 파이프라인 — 계약 정본(SPI·값객체) / DD-04 formatter pipeline — contract SSOT
// 레이어: Format (순수·헤드리스 — DOM/Canvas/프레임워크 미참조)
// 설계: sessions/design-uxui-2026-07/detailed-design/DD-04_formatter-pipeline.md §2·§R
// REQ: T6-802 · TX-888 · T6-801 · T6-803 · T6-805 · T9-001 · T9-002 · T9-837
//      · T2-009 · T2-011 · T2-012 · T2-013 · T2-038 · T9-838
// ------------------------------------------------------------
// 이 파일이 §2 인터페이스 계약의 정본이다. IFormatter=DD-04 소유(교차리뷰 R.2).
// DD-01 ValueKind/MissingReason 은 import(재선언 금지). LocaleMeta 는 DD-12/i18n import.
// ============================================================

import type { ValueKind } from '../domain/DomainValue.js';
import type { MissingReason } from '../domain/Missing.js';
import type { LocaleMeta } from '../i18n/types.js';
import type { MaskType, MaskDef } from '../MaskingEngine.js';
import type { DisplayFormatterFn } from '../types.js';

export type { MaskType, MaskDef } from '../MaskingEngine.js';

// ─────────────────────────────────────────────────────────────
// §2.1 파이프 입출력 / pipe I/O
// ─────────────────────────────────────────────────────────────

/**
 * 소비 표면(누가 표시값을 요구하는가). 포맷 정책 분기(예: aria=음수 낭독, export=색코드 제거).
 * / Consumer surface — used to branch policy (e.g. aria spells minus, export strips color).
 */
export type FormatConsumer =
  | 'cell' | 'chartAxis' | 'chartTooltip' | 'chartDataLabel'
  | 'statusbar' | 'export' | 'aria' | 'clipboard' | 'print';

/** 부호 클래스(이중 부호화·정렬 힌트). / Sign class for dual-encoding & sort hints. */
export type Sign = 'pos' | 'neg' | 'zero';

/**
 * 표시(프레젠테이션) 도메인 종류 — **서식 의도**의 판별자(DD-01 ValueKind=데이터 종류와 구분, §2.1).
 * / Presentation domain kind — the "how to render" discriminant (distinct from DD-01 ValueKind).
 */
export type DomainKind =
  | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'text'
  | 'money' | 'delta' | 'missing' | 'mask';

/** 적용된 파이프 단계 식별자(무결성 provenance·계약테스트). / Applied pipeline stage id. */
export type StageId =
  | 'interpret' | 'domainType' | 'locale' | 'userFormat'
  | 'null' | 'truncate' | 'negative' | 'mask' | 'customHook';

/**
 * 파이프 입력 — DD-01 값 객체(또는 원시값)를 정규화한 캐논 입력. raw 는 값 객체 그대로 보존(역참조 금지).
 * / Canonical pipe input; raw holds the value object as-is (no back-reference).
 */
export interface FormatInput {
  /** DD-01 값 객체 또는 원시값(number|string|Date|null). / A DD-01 value object or a primitive. */
  readonly raw: unknown;
  /** 값 종류(도메인타입 해석의 1차 힌트). 미상이면 'auto'. / Kind hint; 'auto' when unknown. */
  readonly kind?: DomainKind | 'auto';
  /** 컬럼 field(캐시 키·커스텀 훅 컨텍스트). / Column field (cache key & hook ctx). */
  readonly field?: string;
  /** 행 데이터(커스텀 훅 전용, 읽기전용 취급). / Row data (custom-hook only, read-only). */
  readonly row?: unknown;
}

/**
 * 파이프 최종 산출 — 문자열 + 소비자별 파생 시맨틱 메타.
 * / Final pipe output — string plus per-consumer semantic meta.
 */
export interface FormatResult {
  /** 최종 표시 문자열(모든 소비자 공통). / Final display string. */
  readonly text: string;
  /** aria 낭독용 대체 텍스트(괄호 음수 → 마이너스 형태). / Accessible alt text. */
  readonly aria?: string;
  /** 축약/마스킹 시 원값 보존(hover·클립보드·export). / Preserved raw value under abbrev/mask. */
  readonly rawText?: string;
  /** 부호 클래스. / Sign class. */
  readonly sign?: Sign;
  /** AST 색상코드([Red] 등) — DD-05/DD-03 이 형태/부호 병기로 소비. / AST color hint. */
  readonly colorHint?: string;
  /** 적용된 단계 목록(provenance·계약테스트). / Applied stage list. */
  readonly applied: ReadonlyArray<StageId>;
}

// ─────────────────────────────────────────────────────────────
// §2.2 컨텍스트·명세 / context & spec
// ─────────────────────────────────────────────────────────────

/** 파이프 실행 컨텍스트 — 로케일/테마 명시 주입(순수성·캐시 키). / Pipe run context (explicitly injected). */
export interface FormatContext {
  /** 활성 로케일 메타(LocaleRegistry.meta()). intlLocale 로 Intl 포맷. / Active locale meta. */
  readonly locale: LocaleMeta;
  /** 테마 에폭(색코드 무효화용 단조 증가값). / Theme epoch (monotonic; for color invalidation). */
  readonly themeEpoch: number;
  /** 소비 표면(정책 분기). / Consumer surface (policy branch). */
  readonly consumer: FormatConsumer;
}

/** 큰수 축약 정책(REQ-T2-013). / Large-number abbreviation policy. */
export interface AbbrevPolicy {
  /** 축약 스타일: K/M/B(short) 또는 만/억(korean). / Style: K/M/B or 만/억. */
  readonly style: 'short' | 'korean';
  /** 이 절대값 이상에서만 축약(기본 1000). / Abbreviate only at/above this magnitude. */
  readonly threshold?: number;
  /** 축약 표기 소수 자릿수(기본 1). / Fraction digits in abbreviated form. */
  readonly digits?: number;
}

/** 음수 이중 부호화 정책(REQ-T2-012). / Negative dual-encoding policy. */
export interface NegativePolicy {
  /** 회계 괄호 / −기호 / −기호+색. / Accounting parens / minus / minus+color. */
  readonly style: 'parens' | 'minus' | 'minusColor';
  /** minusColor 스타일의 colorHint. / colorHint emitted for the minusColor style. */
  readonly color?: string;
}

/** null/빈값 표시 정책. / Null/empty display policy. */
export interface NullPolicy {
  /** 결측·null 표시 문자열(예 '-' | ''). / Display string for missing/null. */
  readonly text: string;
}

/**
 * 컬럼 1개의 포맷 명세(ColumnDef.format/currency/mask/type 흡수). specId 로 메모이즈.
 * / Per-column format spec (absorbs ColumnDef.format/currency/mask/type). Memoized by specId.
 */
export interface ColumnFormatSpec {
  /** 캐시 안정 식별자(명세 불변 동안 재사용). / Stable cache id. */
  readonly specId: string;
  /** 1차 도메인타입. / Primary domain kind. */
  readonly domain: DomainKind;
  /** ISO 통화코드(currency/money). / ISO currency code. */
  readonly currency?: string;
  /** 컴파일된 사용자 포맷 AST(있으면 최우선 서식). / Compiled user-format AST (top priority). */
  readonly ast?: FormatAst;
  /** 마스킹 정의(mask 도메인). / Masking definition (mask domain). */
  readonly mask?: MaskType | MaskDef;
  /** valueMap(원시 값 → 라벨). 도메인타입보다 우선(열거형). / Value→label map (wins over domain). */
  readonly valueMap?: Readonly<Record<string, string>>;
  /** 큰수 축약 정책. / Abbreviation policy. */
  readonly abbreviate?: AbbrevPolicy;
  /** 음수 이중 부호화 정책. / Negative dual-encoding policy. */
  readonly negative?: NegativePolicy;
  /** null/빈값 표시 정책. / Null/empty policy. */
  readonly nullPolicy?: NullPolicy;
  /** 등록된 커스텀 포맷터 이름 또는 per-instance 훅. / Custom formatter name or per-instance hook. */
  readonly customFormatter?: string | DisplayFormatterFn | null;
  /** 소수 자릿수(precision). / Fraction digits. */
  readonly precision?: number;
  /** 날짜 커스텀 패턴(yyyy/MM/dd 토큰). 미지정 시 로케일 Intl 날짜. / Date pattern; else locale Intl. */
  readonly datePattern?: string;
}

// ─────────────────────────────────────────────────────────────
// §2.3 단계 SPI — ISP 좁은 역할 분할 (REQ-T9-837) / stage SPI
// ─────────────────────────────────────────────────────────────

/**
 * ① 값객체 해석 언랩 결과 — 이후 단계의 순수 입력.
 * / Unwrapped interpretation result — pure input for later stages.
 */
export interface InterpretedValue {
  /** 수치 계열 정규화 값(Money.amount 등). 비수치는 undefined. / Normalized numeric magnitude. */
  readonly magnitude?: number;
  /** 부호 클래스. / Sign class. */
  readonly sign: Sign;
  /** 통화코드(ISO). currency/money 도메인만. / Currency code (currency/money only). */
  readonly currency?: string;
  /** DD-01 소유(import). raw 의 데이터 종류(DomainKind 아님). / DD-01-owned data kind. */
  readonly valueKind: ValueKind;
  /** DD-01 Missing.isMissing() 결과. true → null 정책 단락. / Missing flag → short to null policy. */
  readonly isMissing: boolean;
  /** DD-01 Missing.reason(결측 낭독·export 보존). / Missing reason. */
  readonly missingReason?: MissingReason;
  /** 텍스트/마스크/폴백용 문자열 등가물. / String equivalent for text/mask/fallback. */
  readonly text?: string;
  /** 날짜 도메인용 Date. / Date for the date domain. */
  readonly date?: Date;
}

/**
 * ① 값객체 해석 — raw(DD-01 DomainValue/원시) → 캐논 수치·부호·단위 메타(Money/Delta/Missing 언랩).
 * DD-01 값객체는 읽기만(역참조·재집계 금지, 불변식 2). 반올림·통화 산술은 DD-01 위임.
 * / Interpret raw into a canonical value; DD-01 value objects are read-only.
 */
export interface IValueInterpreter {
  interpret(input: FormatInput): InterpretedValue;
}

/** 로케일 숫자 서식 지시(자릿수·그룹핑). / Locale number directive. */
export interface NumberDirective {
  readonly minFraction?: number;
  readonly maxFraction?: number;
  readonly grouping?: boolean;
}

/** ② 도메인타입 해석 산출 — 종류 확정 + 서식 지시. / Domain-type directive. */
export interface DomainDirective {
  readonly domain: DomainKind;
  readonly number?: NumberDirective;
  readonly currency?: string;
  /** valueMap 적중 라벨(있으면 이후 단계 단락). / Value-map label (short-circuits). */
  readonly valueMapped?: string;
  /** mask 도메인 정의. / Mask definition for the mask domain. */
  readonly maskDef?: MaskType | MaskDef;
}

/** ② 도메인타입 해석 — 종류 결정 + 기본 서식 의도 산출. / Resolve domain kind + default intent. */
export interface IDomainTypeResolver {
  resolve(v: InterpretedValue, spec: ColumnFormatSpec): DomainDirective;
}

/** ③ 로케일 서식 — Intl 기반 숫자/통화/%/날짜(REQ-T9-001). / Locale (Intl) formatting. */
export interface ILocaleFormat {
  formatNumber(n: number, d: NumberDirective, ctx: FormatContext): string;
  formatCurrency(n: number, currency: string, d: NumberDirective, ctx: FormatContext): string;
  formatPercent(n: number, d: NumberDirective, ctx: FormatContext): string;
  formatDate(d: Date, pattern: string | undefined, ctx: FormatContext): string;
}

/** ④ 사용자 포맷 AST 렌더 산출. / User-format AST render. */
export interface AstRender {
  readonly text: string;
  readonly colorHint?: string;
  /** 음수 섹션(괄호) aria 대체 — 색·괄호 형태 대신 −기호 낭독(AA, KM-DB016). / Minus-form aria for negative sections. */
  readonly aria?: string;
}

/** ④ 사용자 포맷 — 컴파일된 AST 를 로케일 산출 위에 적용(다중섹션·색코드). / Apply compiled AST. */
export interface IUserFormatSpec {
  apply(ast: FormatAst, v: InterpretedValue, ctx: FormatContext): AstRender;
}

/** 좁은 정책(ISP) — null. / Narrow policy — null. */
export interface INullPolicy {
  /** null=미참여(파이프 계속), 문자열=null 표시값. / null = not participating; string = null display. */
  render(input: FormatInput, ctx: FormatContext): string | null;
}

/** 좁은 정책(ISP) — 큰수 축약. / Narrow policy — abbreviation. */
export interface ITruncatePolicy {
  abbreviate(n: number, p: AbbrevPolicy, ctx: FormatContext): { text: string; rawText: string } | null;
}

/** 좁은 정책(ISP) — 음수 이중 부호화. / Narrow policy — negative dual encoding. */
export interface INegativePolicy {
  encode(text: string, sign: Sign, p: NegativePolicy): { text: string; aria?: string; colorHint?: string };
}

/** 좁은 정책(ISP) — 마스킹(MaskingEngine.applyMask 래퍼). / Narrow policy — masking wrapper. */
export interface IMaskPolicy {
  mask(value: string, def: MaskType | MaskDef): string;
}

// ─────────────────────────────────────────────────────────────
// §2.3 커스텀 포맷터 Strategy (REQ-T9-002) / custom formatter strategy
// ─────────────────────────────────────────────────────────────

/**
 * ★PROVISIONAL — DD-10 확장 아키텍처(IExtension) 미착지. DD-03 이 RuleVerdict 를 임시 정의한 선례와 동일.
 * DD-10 §2.5 착지 시 `import type { IExtension } from '../<dd10>'` 로 교체하고 이 블록 삭제(주석 명시).
 * activate/dispose 자원 대칭·name 만 최소 계약으로 둔다(register 로 획득한 자원의 대칭 해제).
 * / PROVISIONAL: DD-10 IExtension not yet landed (mirrors DD-03's RuleVerdict provisional). Replace
 *   with an import when DD-10 §2.5 lands and delete this block.
 */
export interface IExtension {
  readonly name: string;
  activate?(ctx?: unknown): void;
  dispose?(): void;
}

/**
 * 커스텀 포맷터 Strategy (REQ-T9-002) — format/parse 대칭. DD-04 가 IFormatter 정본(교차리뷰 R.2).
 * ctx 형은 DD-04 FormatContext 로 통일(DD-10 축약 FmtCtx 아님).
 * / Custom formatter strategy (format/parse). DD-04 owns IFormatter; ctx is DD-04 FormatContext.
 */
export interface IFormatter extends IExtension {
  /** 예: 'IFormatter@1' — SPI 버저닝(DD-10 conformance 대상). / SPI version tag. */
  readonly spi: string;
  readonly name: string;
  format(value: unknown, ctx: FormatContext): string;
  /** 편집 역변환(에디터 소비). / Inverse for editors. */
  parse?(text: string, ctx: FormatContext): unknown;
}

// ─────────────────────────────────────────────────────────────
// §2.4 파사드 포트 / facade port
// ─────────────────────────────────────────────────────────────

/**
 * 차트·export 등이 주입받는 좁은 포트(공유 커널, REQ-T6-805). 그리드 내부 클래스 import 금지.
 * / Narrow shared-kernel port injected into chart/export (no grid-internal imports).
 */
export interface IDisplayFormatPort {
  formatScalar(n: number, spec: ColumnFormatSpec, ctx: FormatContext): string;
  text(input: FormatInput, spec: ColumnFormatSpec, ctx: FormatContext): string;
}

// ─────────────────────────────────────────────────────────────
// §2.5 버전드 포맷 문법 AST / versioned format grammar AST
// ─────────────────────────────────────────────────────────────

/** 포맷 토큰(리터럴·숫자토큰·통화기호·백분율). / Format token. */
export type FormatToken =
  | { readonly t: 'lit'; readonly s: string }
  | { readonly t: 'int'; readonly grouping: boolean }
  | { readonly t: 'frac'; readonly digits: number }
  | { readonly t: 'currencySym' }
  | { readonly t: 'percent' };

/** 다중섹션 1개(양수/음수/0/텍스트 중 하나). / One AST section. */
export interface FormatSection {
  readonly tokens: FormatToken[];
  /** [Red] 등 색코드 — 색 단독 부호화 가드(colorHint). / Color code guard. */
  readonly colorCode?: string;
  /** 조건 어휘(additive, grammarVersion 2+ 예약). / Condition vocabulary (reserved). */
  readonly condition?: { readonly op: '<' | '>' | '<=' | '>=' | '='; readonly value: number };
}

/** 다중섹션 AST + 문법 버전. Excel 포맷 문자열 컴파일 산출(REQ-T2-038·TX-888). / Multi-section AST + grammar version. */
export interface FormatAst {
  /** additive 진화 — 낮은 버전 AST 는 상위 렌더러가 동일 해석. / Grammar version. */
  readonly grammarVersion: number;
  /** [pos, neg?, zero?, text?]. / Sections. */
  readonly sections: FormatSection[];
}

/** 컴파일 진단(throw 아닌 신호). / Compile diagnostic (signal, not throw). */
export interface FormatDiagnostic {
  readonly severity: 'warn' | 'error';
  readonly message: string;
}

/** 컴파일러 — 문자열 → AST(문법 버전 스탬프). 실패는 진단 + 원문 리터럴 폴백. / Format-string compiler. */
export interface IUserFormatCompiler {
  readonly grammarVersion: number;
  compile(format: string): { ast: FormatAst; diagnostics: FormatDiagnostic[] };
}

// ─────────────────────────────────────────────────────────────
// 캐시 키 / cache key
// ─────────────────────────────────────────────────────────────

/** 메모이즈 캐시 키축 — (rawKey|specId|localeId|grammarVer|themeEpoch|consumer). / Memoize cache key axes. */
export interface FormatCacheKey {
  readonly rawKey: string;
  readonly specId: string;
  readonly localeId: string;
  readonly grammarVer: number;
  readonly themeEpoch: number;
  readonly consumer: FormatConsumer;
}
