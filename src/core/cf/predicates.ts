// ============================================================
// DD-05 §2.2·§4 조건 카탈로그 — CFPredicate 술어 9종 + CFRuleTypeRegistry(OCP SPI)
// / DD-05 §2.2·§4 condition catalog — 9 CFPredicate strategies + rule-type registry (OCP SPI).
// REQ: T5-042 · T5-047 · T5-001
// ------------------------------------------------------------
// 각 조건은 순수 판정 술어(Interpreter 경량). 열 전역 통계가 필요한 조건(topN·stdBand·duplicate)은
// needs 로 선언 → 엔진이 컬럼 스캔 1회로 stats 를 채운다(REQ-T5-803). now·stats 는 ctx/인자로 주입
// (DOM·Date.now·난수 금지 = 결정론). 레지스트리는 DD-10 IRegistry 동형(TypedRegistry) — 미지 type 은
// get→undefined → 로더/평가가 skip. 헤드리스.
// ============================================================

import { TypedRegistry, type IRegistry } from '../extension/Registry.js';
import type { CFCondition } from './CFRule.js';
import type { CellInput, ColumnStats, EvalCtx, StatKind } from './eval-types.js';

/**
 * 조건 판정 술어(Strategy) — 순수. needs 로 요구 통계를 미리 선언(엔진이 stats 로 준다).
 * / A pure condition predicate (Strategy). Declares required stats via needs.
 *
 * @typeParam C - 이 술어가 해석하는 조건 형 / The condition kind this predicate interprets
 */
export interface CFPredicate<C extends CFCondition = CFCondition> {
  /** 이 조건이 요구하는 통계 명세. / The stats this condition requires. */
  readonly needs: readonly StatKind[];
  /** true=발화. DOM·Date.now·난수 금지 — now·stats 는 주입. / true = fires; determinism enforced. */
  test(cond: C, input: CellInput, stats: ColumnStats, ctx: EvalCtx): boolean;
}

/** 값을 유한 수치로 강제(비수치=NaN). / Coerce a value to a finite number (non-numeric = NaN). */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return n;
}

// ── 하루 경계 유틸(상대날짜, ctx.now 기준·결정론) ──────────────────────────
const DAY = 86_400_000;
function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function startOfWeek(ms: number): number {
  const sod = startOfDay(ms);
  const dow = new Date(sod).getDay(); // 0=Sun
  return sod - dow * DAY;
}

// ── 술어 9종 ────────────────────────────────────────────────────────────

const comparePredicate: CFPredicate<Extract<CFCondition, { type: 'compare' }>> = {
  needs: [],
  test(cond, input) {
    const v = num(input.value);
    if (!Number.isFinite(v)) return false;
    switch (cond.op) {
      case '>': return v > cond.a;
      case '>=': return v >= cond.a;
      case '<': return v < cond.a;
      case '<=': return v <= cond.a;
      case '=': return v === cond.a;
      case '!=': return v !== cond.a;
      case 'between': return cond.b !== undefined && v >= Math.min(cond.a, cond.b) && v <= Math.max(cond.a, cond.b);
      default: return false;
    }
  },
};

const textContainsPredicate: CFPredicate<Extract<CFCondition, { type: 'textContains' }>> = {
  needs: [],
  test(cond, input) {
    const s = input.value == null ? '' : String(input.value);
    return cond.ci === false
      ? s.includes(cond.text)
      : s.toLowerCase().includes(cond.text.toLowerCase());
  },
};

const dateOccurringPredicate: CFPredicate<Extract<CFCondition, { type: 'dateOccurring' }>> = {
  needs: [],
  test(cond, input, _stats, ctx) {
    const raw = input.value;
    const t = raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw : Date.parse(String(raw));
    if (!Number.isFinite(t)) return false;
    const now = ctx.now;
    const today = startOfDay(now);
    switch (cond.rel) {
      case 'today': return startOfDay(t) === today;
      case 'yesterday': return startOfDay(t) === today - DAY;
      case 'tomorrow': return startOfDay(t) === today + DAY;
      case 'thisWeek': { const w = startOfWeek(now); return t >= w && t < w + 7 * DAY; }
      case 'lastWeek': { const w = startOfWeek(now) - 7 * DAY; return t >= w && t < w + 7 * DAY; }
      case 'thisMonth': { const d = new Date(now); return new Date(t).getFullYear() === d.getFullYear() && new Date(t).getMonth() === d.getMonth(); }
      case 'lastMonth': { const d = new Date(now.valueOf()); const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1); return new Date(t).getFullYear() === lm.getFullYear() && new Date(t).getMonth() === lm.getMonth(); }
      case 'next7d': return t >= today && t < today + 7 * DAY;
      case 'last7d': return t < today + DAY && t >= today - 6 * DAY;
      default: return false;
    }
  },
};

const topNPredicate: CFPredicate<Extract<CFCondition, { type: 'topN' }>> = {
  needs: ['rank'],
  test(cond, input, stats) {
    const v = num(input.value);
    if (!Number.isFinite(v)) return false;
    if (cond.bottom) return stats.rankAscOf ? stats.rankAscOf(v) <= cond.n : false;
    return stats.rankOf ? stats.rankOf(v) <= cond.n : false;
  },
};

const topNpctPredicate: CFPredicate<Extract<CFCondition, { type: 'topNpct' }>> = {
  needs: ['percentile'],
  test(cond, input, stats) {
    const v = num(input.value);
    if (!Number.isFinite(v) || !stats.percentileOf) return false;
    const p = stats.percentileOf(v); // fraction ≤ v
    return cond.bottom ? p <= cond.pct / 100 : p >= 1 - cond.pct / 100;
  },
};

const aboveAvgPredicate: CFPredicate<Extract<CFCondition, { type: 'aboveAvg' }>> = {
  needs: ['avg'],
  test(cond, input, stats) {
    const v = num(input.value);
    if (!Number.isFinite(v) || stats.avg === undefined) return false;
    return cond.below ? v < stats.avg : v > stats.avg;
  },
};

const stdBandPredicate: CFPredicate<Extract<CFCondition, { type: 'stdBand' }>> = {
  needs: ['avg', 'stddev'],
  test(cond, input, stats) {
    const v = num(input.value);
    if (!Number.isFinite(v) || stats.avg === undefined || stats.stddev === undefined) return false;
    const dist = Math.abs(v - stats.avg);
    const band = cond.k * stats.stddev;
    return cond.outside === false ? dist <= band : dist >= band;
  },
};

const duplicatePredicate: CFPredicate<Extract<CFCondition, { type: 'duplicate' }>> = {
  needs: ['cardinality'],
  test(cond, input, stats) {
    const v = num(input.value);
    if (!Number.isFinite(v) || !stats.countOf) return false;
    const c = stats.countOf(v);
    return cond.unique ? c === 1 : c > 1;
  },
};

/** custom 은 등록된 predicateId 로 위임 — 코어 기본은 항상 미발화(등록 술어가 대체). / custom: delegated. */
const customFallbackPredicate: CFPredicate<Extract<CFCondition, { type: 'custom' }>> = {
  needs: [],
  test() { return false; },
};

/** 코어 내장 술어 8종 + custom 폴백(등록 map). / The 8 built-in predicates + custom fallback. */
export const BUILTIN_PREDICATES: Readonly<Record<CFCondition['type'], CFPredicate>> = Object.freeze({
  compare: comparePredicate as CFPredicate,
  textContains: textContainsPredicate as CFPredicate,
  dateOccurring: dateOccurringPredicate as CFPredicate,
  topN: topNPredicate as CFPredicate,
  topNpct: topNpctPredicate as CFPredicate,
  aboveAvg: aboveAvgPredicate as CFPredicate,
  stdBand: stdBandPredicate as CFPredicate,
  duplicate: duplicatePredicate as CFPredicate,
  custom: customFallbackPredicate as CFPredicate,
});

/** CF 조건 술어 레지스트리(DD-10 IRegistry 동형). / CF rule-type registry (IRegistry-homomorphic). */
export type CFRuleTypeRegistry = IRegistry<CFPredicate>;

/**
 * 조건 술어 레지스트리 생성 — 내장 8종+custom 폴백을 builtin 으로 등록(코어 보호), 신규/교체는 SPI.
 * 동일 type 재등록 = last-wins(user origin), builtin 은 override:true 필요(§4.7 교체 시맨틱).
 * / Create the rule-type registry with built-ins registered as protected; new/replacement via SPI.
 *
 * @returns 내장 술어가 채워진 IRegistry / An IRegistry pre-populated with built-in predicates
 */
export function createRuleTypeRegistry(): CFRuleTypeRegistry {
  const reg = new TypedRegistry<CFPredicate>({ spi: { name: 'CFPredicate', version: '1' } });
  for (const [type, pred] of Object.entries(BUILTIN_PREDICATES)) {
    reg.register(type, pred, { origin: 'builtin' });
  }
  return reg;
}
