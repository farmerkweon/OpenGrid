// ============================================================
// DD-04 표시값 산출 단일 정본 파사드 / DD-04 single-source display formatter facade
// 설계: DD-04 §2.4·§3(UC-1~5) · REQ-T6-802 · TX-888 · T6-805
// raw → 표시 문자열. 단계 순서 interpret→domainType→truncate→locale→userFormat→negative→customHook.
// 우선순위 합성(도메인타입 ≺ 로케일 ≺ 사용자 포맷/훅) + 메모이즈. 모든 소비자의 SSOT.
// 순수·결정론: format(input,spec,ctx) 는 인자 외 가변상태 미참조(로케일/테마는 ctx 주입).
// ============================================================

import type {
  ColumnFormatSpec, DomainDirective, FormatCacheKey, FormatConsumer, FormatContext,
  FormatInput, FormatResult, IDisplayFormatPort, IDomainTypeResolver, IFormatter,
  ILocaleFormat, IMaskPolicy, INegativePolicy, INullPolicy, InterpretedValue,
  ITruncatePolicy, IUserFormatSpec, IValueInterpreter, Sign, StageId,
} from './types.js';
import type { DisplayFormatterFn } from '../types.js';
import type { DomainValue } from '../domain/DomainValue.js';
import { FormatterRegistry } from './FormatterRegistry.js';
import { FormatCache } from './FormatCache.js';

/** DisplayFormatter 협력자 묶음(생성자 주입). / Collaborators injected into the facade. */
export interface DisplayFormatterDeps {
  interpreter: IValueInterpreter;
  domain: IDomainTypeResolver;
  locale: ILocaleFormat;
  user: IUserFormatSpec;
  nullP: INullPolicy;
  truncate: ITruncatePolicy;
  negative: INegativePolicy;
  mask: IMaskPolicy;
  registry: FormatterRegistry;
  cache: FormatCache;
}

/** raw 캐시 키 산출(값객체=hashKey, Date=시각, 원시=문자열). / Compute the raw cache-key. */
function rawKeyOf(raw: unknown): string {
  if (raw === null || raw === undefined) return '∅';
  if (typeof raw === 'object') {
    const dv = raw as Partial<DomainValue> & { getTime?: () => number };
    if (typeof dv.hashKey === 'function') return dv.hashKey();
    if (raw instanceof Date) return `d${raw.getTime()}`;
  }
  return String(raw);
}

/**
 * 표시값 산출의 단일 정본 파사드. 모든 소비자(셀/차트/집계/export/aria/클립보드/인쇄)가 통과.
 * / The single-source display formatter facade; every consumer passes through it.
 */
export class DisplayFormatter implements IDisplayFormatPort {
  constructor(private readonly d: DisplayFormatterDeps) {}

  /** 핵심: raw → 표시. 캐시 히트 시 단계 미실행. / Core: raw → display; skips stages on cache hit. */
  format(input: FormatInput, spec: ColumnFormatSpec, ctx: FormatContext): FormatResult {
    const key: FormatCacheKey = {
      rawKey: rawKeyOf(input.raw),
      specId: spec.specId,
      localeId: ctx.locale.intlLocale,
      grammarVer: spec.ast?.grammarVersion ?? 0,
      themeEpoch: ctx.themeEpoch,
      consumer: ctx.consumer,
    };
    const hit = this.d.cache.get(key);
    if (hit) return hit;
    const result = this._run(input, spec, ctx);
    this.d.cache.set(key, result);
    return result;
  }

  /** 편의(문자열만) — 대다수 소비자 핫패스. / Convenience: text only (hot path). */
  text(input: FormatInput, spec: ColumnFormatSpec, ctx: FormatContext): string {
    return this.format(input, spec, ctx).text;
  }

  /**
   * 차트/집계용 포트 — 이미 집계·다운샘플된 수치에 라벨 서식만 적용(REQ-T6-802).
   * interpret 생략(이미 수치) → domainType→truncate→locale→userFormat→negative. 셀과 동일 서식.
   * / Chart/aggregate port; applies label formatting to an already-aggregated number.
   */
  formatScalar(n: number, spec: ColumnFormatSpec, ctx: FormatContext): string {
    const iv: InterpretedValue = {
      magnitude: n,
      sign: n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero',
      valueKind: spec.domain === 'money' || spec.domain === 'currency' ? 'money' : 'number',
      isMissing: false,
      text: String(n),
    };
    const dir = this.d.domain.resolve(iv, spec);
    if (dir.valueMapped !== undefined) return dir.valueMapped;
    return this._numeric(iv, dir, spec, ctx, []).text;
  }

  /** 로케일 변경 훅 — 캐시 정확 무효화. / Locale-change hook — precise cache invalidation. */
  onLocaleChange(): void { this.d.cache.invalidateLocale(); }
  /** 테마 변경 훅 — 색코드 축 무효화. / Theme-change hook — color-axis invalidation. */
  onThemeChange(): void { this.d.cache.invalidateTheme(); }

  // ── 파이프 본체 ───────────────────────────────────────────

  private _run(input: FormatInput, spec: ColumnFormatSpec, ctx: FormatContext): FormatResult {
    const applied: StageId[] = [];

    // ① interpret
    const iv = this.d.interpreter.interpret(input);
    applied.push('interpret');

    // null 정책(단락) — spec.nullPolicy.text 우선, 없으면 주입 정책 / null policy short-circuit
    if (iv.isMissing) {
      const nullText = spec.nullPolicy?.text ?? this.d.nullP.render(input, ctx) ?? '';
      applied.push('null');
      const aria = this._missingAria(iv, nullText, ctx);
      return this._hook(spec, input, ctx, {
        text: nullText, aria, sign: 'zero', applied,
      });
    }

    // ② domainType
    const dir = this.d.domain.resolve(iv, spec);
    applied.push('domainType');

    // valueMap 단락(열거형) / value-map short-circuit
    if (dir.valueMapped !== undefined) {
      return this._hook(spec, input, ctx, {
        text: dir.valueMapped, sign: iv.sign, applied,
      });
    }

    // mask 도메인 / mask domain
    if (dir.domain === 'mask' && dir.maskDef !== undefined) {
      const raw = iv.text ?? String(input.raw);
      const masked = this.d.mask.mask(raw, dir.maskDef);
      applied.push('mask');
      // aria=마스킹값 낭독(원값 유출 금지), rawText=원값 보존(편집/export) / aria masked; rawText raw
      return this._hook(spec, input, ctx, {
        text: masked, aria: masked, rawText: raw, sign: iv.sign, applied,
      });
    }

    // date/datetime 도메인 / date domain
    if (dir.domain === 'date' || dir.domain === 'datetime') {
      const dt = iv.date ?? (typeof input.raw === 'string' || typeof input.raw === 'number'
        ? new Date(input.raw) : undefined);
      const text = dt ? this.d.locale.formatDate(dt, spec.datePattern, ctx) : (iv.text ?? '');
      applied.push('locale');
      return this._hook(spec, input, ctx, { text, sign: 'zero', applied });
    }

    // text 도메인 / text domain
    if (dir.domain === 'text' || iv.magnitude === undefined) {
      const text = iv.text ?? String(input.raw);
      return this._hook(spec, input, ctx, { text, sign: iv.sign, applied });
    }

    // 수치 계열(number/currency/percent/money/delta) / numeric family
    const numeric = this._numeric(iv, dir, spec, ctx, applied);
    return this._hook(spec, input, ctx, numeric);
  }

  /** 수치 파이프: truncate→locale/userFormat→negative. 우선순위 합성. / Numeric pipe with priority composition. */
  private _numeric(
    iv: InterpretedValue, dir: DomainDirective, spec: ColumnFormatSpec,
    ctx: FormatContext, applied: StageId[],
  ): { text: string; aria?: string; rawText?: string; sign: Sign; colorHint?: string; applied: StageId[] } {
    const n = iv.magnitude ?? 0;
    let text: string;
    let aria: string | undefined;
    let rawText: string | undefined;
    let colorHint: string | undefined;

    if (spec.ast) {
      // ④ 사용자 포맷 AST 최우선(다중섹션·색코드, 부호 자체 처리) / user AST wins; handles sign
      const rendered = this.d.user.apply(spec.ast, iv, ctx);
      applied.push('userFormat');
      text = rendered.text;
      colorHint = rendered.colorHint;
      if (rendered.aria !== undefined) aria = rendered.aria; // AST 음수 −기호 낭독(AA) / minus-form aria
    } else {
      // ③ truncate(옵션) → locale / abbreviation then locale
      let handled = false;
      if (spec.abbreviate) {
        const t = this.d.truncate.abbreviate(n, spec.abbreviate, ctx);
        if (t) { text = t.text; rawText = t.rawText; applied.push('truncate'); handled = true; }
      }
      if (!handled) {
        text = this._localeBody(iv, dir, ctx);
        applied.push('locale');
      }
      // negative(옵션) 이중 부호화 / negative dual encoding
      if (iv.sign === 'neg' && spec.negative) {
        const enc = this.d.negative.encode(text!, iv.sign, spec.negative);
        applied.push('negative');
        text = enc.text;
        if (enc.aria !== undefined) aria = enc.aria;
        if (enc.colorHint !== undefined) colorHint = enc.colorHint;
      }
    }

    const out: { text: string; aria?: string; rawText?: string; sign: Sign; colorHint?: string; applied: StageId[] } = {
      text: text!, sign: iv.sign, applied,
    };
    if (aria !== undefined) out.aria = aria;
    if (rawText !== undefined) out.rawText = rawText;
    if (colorHint !== undefined) out.colorHint = colorHint;
    return out;
  }

  /** 도메인별 로케일 본문 산출(number/currency/percent). / Locale numeric body per domain. */
  private _localeBody(iv: InterpretedValue, dir: DomainDirective, ctx: FormatContext): string {
    const n = iv.magnitude ?? 0;
    const nd = dir.number ?? { grouping: true };
    switch (dir.domain) {
      case 'currency':
      case 'money':
        return dir.currency
          ? this.d.locale.formatCurrency(n, dir.currency, nd, ctx)
          : this.d.locale.formatNumber(n, nd, ctx);
      case 'percent':
        return this.d.locale.formatPercent(n, nd, ctx);
      case 'number':
      case 'delta':
      default:
        return this.d.locale.formatNumber(n, nd, ctx);
    }
  }

  /** 결측 aria — 사유가 있으면 결측 낭독, 없으면 null 표시값. / Missing aria; spells the reason if present. */
  private _missingAria(iv: InterpretedValue, nullText: string, _ctx: FormatContext): string {
    return iv.missingReason ? `missing: ${iv.missingReason}` : nullText;
  }

  /** ⑦ customHook 단계 — displayFormatter 슬롯/등록 포맷터를 마지막에 적용(null=파이프 산출 폴백). */
  private _hook(
    spec: ColumnFormatSpec, input: FormatInput, ctx: FormatContext,
    base: { text: string; aria?: string; rawText?: string; sign?: Sign; colorHint?: string; applied: StageId[] },
  ): FormatResult {
    const cf = spec.customFormatter;
    if (cf == null) return base as FormatResult;

    let hooked: string | null = null;
    if (typeof cf === 'string') {
      const fmt: IFormatter | undefined = this.d.registry.resolve(cf);
      if (fmt) { try { hooked = fmt.format(input.raw, ctx); } catch { hooked = null; } }
    } else {
      const fn = cf as DisplayFormatterFn;
      try { hooked = fn(input.raw, input.field ?? '', input.row); } catch { hooked = null; }
    }

    if (hooked == null) return base as FormatResult; // 비파괴 폴백 / non-destructive fallback
    const applied: StageId[] = [...base.applied, 'customHook'];
    const out: FormatResult = { ...base, text: hooked, applied };
    return out;
  }
}
