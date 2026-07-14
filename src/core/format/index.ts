// ============================================================
// DD-04 포맷터 파이프라인 — 배럴 + 기본 조립 / DD-04 formatter pipeline — barrel + default wiring
// 설계: DD-04 §2·§5(배선) · REQ-T6-802 · TX-888
// createDisplayFormatter(): 8단계 + registry(child) + cache 를 격리 조립(멀티그리드 오염 0).
// compileFormatSpec(): 컬럼 힌트 → ColumnFormatSpec(specId·AST 컴파일 1회).
// ============================================================

export * from './types.js';
export { DisplayFormatter } from './DisplayFormatter.js';
export type { DisplayFormatterDeps } from './DisplayFormatter.js';
export { FormatterRegistry, formatterRegistry } from './FormatterRegistry.js';
export { FormatCache } from './FormatCache.js';
export { ValueInterpreter } from './pipeline/ValueInterpreter.js';
export { DomainTypeResolver } from './pipeline/DomainTypeResolver.js';
export { LocaleFormat } from './pipeline/LocaleFormat.js';
export { FormatCompiler, defaultFormatCompiler, FORMAT_GRAMMAR_VERSION } from './grammar/FormatCompiler.js';
export { AstRenderer } from './grammar/AstRenderer.js';
export { NullPolicy } from './policy/NullPolicy.js';
export { TruncatePolicy } from './policy/TruncatePolicy.js';
export { NegativePolicy } from './policy/NegativePolicy.js';
export { MaskPolicy } from './policy/MaskPolicy.js';

import { DisplayFormatter, type DisplayFormatterDeps } from './DisplayFormatter.js';
import { FormatterRegistry, formatterRegistry } from './FormatterRegistry.js';
import { FormatCache } from './FormatCache.js';
import { ValueInterpreter } from './pipeline/ValueInterpreter.js';
import { DomainTypeResolver } from './pipeline/DomainTypeResolver.js';
import { LocaleFormat } from './pipeline/LocaleFormat.js';
import { AstRenderer } from './grammar/AstRenderer.js';
import { defaultFormatCompiler } from './grammar/FormatCompiler.js';
import { NullPolicy } from './policy/NullPolicy.js';
import { TruncatePolicy } from './policy/TruncatePolicy.js';
import { NegativePolicy } from './policy/NegativePolicy.js';
import { MaskPolicy } from './policy/MaskPolicy.js';
import type {
  ColumnFormatSpec, DomainKind, FormatAst, MaskDef, MaskType, NegativePolicy as NegPolicy,
  NullPolicy as NullPol, AbbrevPolicy,
} from './types.js';
import type { DisplayFormatterFn } from '../types.js';

/** 기본 조립 옵션(협력자 오버라이드·격리). / Default assembly options. */
export interface CreateDisplayFormatterOptions {
  /** 부모 포맷터 레지스트리(child 격리). 미지정 시 전역. / Parent registry (child isolation); global if unset. */
  parentRegistry?: FormatterRegistry;
  /** 협력자 부분 오버라이드(Strategy 교체·OCP). / Partial collaborator overrides (Strategy swap). */
  overrides?: Partial<DisplayFormatterDeps>;
  /** 캐시 최대 엔트리. / Cache max entries. */
  cacheMax?: number;
}

/**
 * 기본 DisplayFormatter 조립(8단계 + child registry + per-instance cache).
 * / Assemble a default DisplayFormatter (8 stages + child registry + per-instance cache).
 */
export function createDisplayFormatter(opts: CreateDisplayFormatterOptions = {}): DisplayFormatter {
  const locale = opts.overrides?.locale ?? new LocaleFormat();
  const registry = (opts.parentRegistry ?? formatterRegistry).child();
  const deps: DisplayFormatterDeps = {
    interpreter: opts.overrides?.interpreter ?? new ValueInterpreter(),
    domain: opts.overrides?.domain ?? new DomainTypeResolver(),
    locale,
    user: opts.overrides?.user ?? new AstRenderer(locale),
    nullP: opts.overrides?.nullP ?? new NullPolicy(),
    truncate: opts.overrides?.truncate ?? new TruncatePolicy(),
    negative: opts.overrides?.negative ?? new NegativePolicy(),
    mask: opts.overrides?.mask ?? new MaskPolicy(),
    registry: opts.overrides?.registry ?? registry,
    cache: opts.overrides?.cache ?? new FormatCache(opts.cacheMax),
  };
  return new DisplayFormatter(deps);
}

/** compileFormatSpec 입력(컬럼 힌트, 헤드리스 — ColumnDef 미의존). / compileFormatSpec input (headless). */
export interface FormatSpecInput {
  field?: string;
  domain?: DomainKind;
  /** 레거시 dataType/type('number'|'currency'|'date'|'mask'…). / Legacy dataType/type. */
  type?: string;
  /** Excel식 포맷 문자열('#,##0;[Red](#,##0)'). / Excel-style format string. */
  format?: string;
  currency?: string;
  mask?: MaskType | MaskDef;
  valueMap?: Readonly<Record<string, string>>;
  abbreviate?: AbbrevPolicy;
  negative?: NegPolicy;
  nullPolicy?: NullPol;
  customFormatter?: string | DisplayFormatterFn | null;
  precision?: number;
  datePattern?: string;
}

/** 레거시 type → DomainKind. / Legacy type → DomainKind. */
const TYPE_TO_DOMAIN: Record<string, DomainKind> = {
  number: 'number', currency: 'currency', money: 'money', percent: 'percent',
  date: 'date', datetime: 'datetime', text: 'text', string: 'text', mask: 'mask',
};

/** 도메인 확정(domain 명시 > mask > currency > type > number). / Resolve the domain. */
function resolveDomain(i: FormatSpecInput): DomainKind {
  if (i.domain) return i.domain;
  if (i.mask) return 'mask';
  if (i.currency) return 'currency';
  if (i.type && TYPE_TO_DOMAIN[i.type]) return TYPE_TO_DOMAIN[i.type]!;
  return 'number';
}

/**
 * 컬럼 힌트 → ColumnFormatSpec(specId·AST 컴파일 1회). 명세 불변 동안 재사용(메모이즈 안정).
 * / Compile a column hint into a ColumnFormatSpec (specId + one-time AST compile).
 */
export function compileFormatSpec(input: FormatSpecInput): ColumnFormatSpec {
  const domain = resolveDomain(input);
  let ast: FormatAst | undefined;
  if (input.format) {
    ast = defaultFormatCompiler.compile(input.format).ast;
  }
  const specId = JSON.stringify({
    d: domain, f: input.format ?? null, c: input.currency ?? null,
    m: input.mask ?? null, v: input.valueMap ?? null, p: input.precision ?? null,
    a: input.abbreviate ?? null, n: input.negative ?? null, np: input.nullPolicy ?? null,
    dp: input.datePattern ?? null,
    cf: typeof input.customFormatter === 'string' ? input.customFormatter : (input.customFormatter ? 'fn' : null),
    g: ast?.grammarVersion ?? 0,
  });

  const spec: {
    specId: string; domain: DomainKind; currency?: string; ast?: FormatAst;
    mask?: MaskType | MaskDef; valueMap?: Readonly<Record<string, string>>;
    abbreviate?: AbbrevPolicy; negative?: NegPolicy; nullPolicy?: NullPol;
    customFormatter?: string | DisplayFormatterFn | null; precision?: number; datePattern?: string;
  } = { specId, domain };

  if (input.currency !== undefined) spec.currency = input.currency;
  if (ast !== undefined) spec.ast = ast;
  if (input.mask !== undefined) spec.mask = input.mask;
  if (input.valueMap !== undefined) spec.valueMap = input.valueMap;
  if (input.abbreviate !== undefined) spec.abbreviate = input.abbreviate;
  if (input.negative !== undefined) spec.negative = input.negative;
  if (input.nullPolicy !== undefined) spec.nullPolicy = input.nullPolicy;
  if (input.customFormatter !== undefined) spec.customFormatter = input.customFormatter;
  if (input.precision !== undefined) spec.precision = input.precision;
  if (input.datePattern !== undefined) spec.datePattern = input.datePattern;

  return spec;
}
