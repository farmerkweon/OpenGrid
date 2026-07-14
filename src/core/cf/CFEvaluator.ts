// ============================================================
// DD-05 §2.3 평가층 — 순수(평가⟂적용의 평가 측) / DD-05 §2.3 evaluation layer — pure.
// REQ: T5-808 · T5-016 · T5-809 · T5-007 · T5-012 · T5-013
// ------------------------------------------------------------
// evaluate(): 스코프 매칭 → priority 오름차순 정렬(동값 id tie-break) → 각 규칙 when 판정 →
// 발화 시 도메인 datum(정규화비율·부호·구간) 산출 → 층 분리(bar|scale=배경 최상위 1, icon|sparkline=데코)
// → Stop-If-True 전역 단락. 반환은 hex·px 0(도메인 판정만). 결정론·헤드리스.
// ============================================================

import type { CFRule, CFEncodeSpec } from './CFRule.js';
import type { CellInput, ColumnStats, EvalCtx, RuleVerdict, CFCellVerdict, RuleDatum } from './eval-types.js';
import type { RuleLineage } from './lineage.js';
import { snapshotStats } from './lineage.js';
import type { CFPredicate, CFRuleTypeRegistry } from './predicates.js';

/** 순수 평가 엔진 인터페이스 — 캔버스 없는 단위테스트의 표면(REQ-T5-808). / Pure evaluator SPI. */
export interface CFEvaluator {
  evaluate(rules: readonly CFRule[], input: CellInput, stats: ColumnStats, ctx: EvalCtx): CFCellVerdict;
}

/** 규칙이 이 셀 입력에 스코프상 걸리는가. / Whether a rule's scope matches this cell input. */
export function scopeMatches(rule: CFRule, input: CellInput): boolean {
  const s = rule.scope;
  if (s.columnId !== input.columnId) return false;
  if (s.range && (input.rowIndex < s.range.startRow || input.rowIndex >= s.range.endRow)) return false;
  if (s.rowState && s.rowState !== input.rowState) return false;
  return true;
}

/** 결정론 정렬: priority 오름차순, 동값이면 id 사전순(§2.1 tie-break). / Deterministic priority→id sort. */
function sortRules(rules: readonly CFRule[]): CFRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * 발화 규칙의 도메인 결과 산출(순수) — 시각 원시값 아님. bar/scale 만 수치 datum, icon/sparkline 은
 * 구간·부호만. 0기준·음수 양방향·클램프·발산 중립의 판정을 여기서 결정(정직성 색·px 는 인코더).
 * / Compute a fired rule's domain datum (pure) — never a visual primitive.
 */
export function computeDatum(encode: CFEncodeSpec, value: unknown, stats: ColumnStats): RuleDatum {
  const v = num(value);
  const hasV = Number.isFinite(v);
  const sign: -1 | 0 | 1 = !hasV || v === 0 ? 0 : v > 0 ? 1 : -1;
  const min = stats.min ?? 0;
  const max = stats.max ?? 0;

  if (encode.kind === 'bar') {
    if (!hasV) return { sign: 0 };
    const axis = encode.axis ?? 'zero';
    let ratio: number;
    let clamped = false;
    if (axis === 'zero') {
      const maxAbs = Math.max(Math.abs(min), Math.abs(max)) || 1;
      const raw = Math.abs(v) / maxAbs;
      ratio = clamp01(raw);
      if (encode.clamp && raw > 1) clamped = true;
    } else {
      const span = max - min || 1;
      const raw = (v - min) / span;
      ratio = clamp01(raw);
      if (encode.clamp && (raw < 0 || raw > 1)) clamped = true;
    }
    return { ratio, sign, value: v, clamped };
  }

  if (encode.kind === 'scale') {
    if (!hasV) return { sign: 0 };
    const mode = encode.mode ?? 'discrete';
    let norm: number;
    if (encode.diverging) {
      const mid = encode.midpoint === 'zero' ? 0 : encode.midpoint === 'mean' ? (stats.avg ?? (min + max) / 2) : typeof encode.midpoint === 'number' ? encode.midpoint : 0;
      if (v <= mid) {
        const lo = mid - min || 1;
        norm = 0.5 * clamp01((v - min) / lo);
      } else {
        const hi = max - mid || 1;
        norm = 0.5 + 0.5 * clamp01((v - mid) / hi);
      }
    } else {
      const span = max - min || 1;
      norm = clamp01((v - min) / span);
    }
    if (mode === 'continuous') {
      return { ratio: norm, sign, value: v };
    }
    // 발산은 중앙 중립 밴드가 필요하므로 최소 3단(ColorScale.divergingBands 클램프와 정합).
    // 순차는 최소 2단. 이 정합이 없으면 발산 bands:2 에서 최댓값이 중립색으로 그려지는 왜곡 발생(T5-013).
    const bandCount = encode.diverging
      ? Math.max(3, Math.min(5, encode.bands ?? 3))
      : Math.max(2, Math.min(5, encode.bands ?? 3));
    const bandIndex = Math.min(bandCount - 1, Math.floor(norm * bandCount));
    return { ratio: norm, bandIndex, bandCount, sign, value: v };
  }

  if (encode.kind === 'icon') {
    if (!hasV) return { sign: 0 };
    const steps = encode.steps ?? 3;
    const span = max - min || 1;
    const norm = clamp01((v - min) / span);
    let bandIndex = Math.min(steps - 1, Math.floor(norm * steps));
    if (encode.reverse) bandIndex = steps - 1 - bandIndex;
    return { bandIndex, bandCount: steps, ratio: norm, sign, value: v };
  }

  // sparkline — 값 자체는 DD-06 이 그림. 부호·원값만 전달.
  return hasV ? { sign, value: v } : { sign };
}

/** 술어 미등록·조건 형 불일치 방어 조회. / Guarded predicate lookup. */
function predicateFor(reg: CFRuleTypeRegistry, type: string): CFPredicate | undefined {
  return reg.get(type);
}

/**
 * 우선순위·Stop-If-True 를 병합하는 순수 평가기. 술어 레지스트리를 주입받아 미지 type 은 skip(발화 안 함).
 * / Pure evaluator merging priority + Stop-If-True. Unknown condition types skip (never fire).
 */
export class DefaultCFEvaluator implements CFEvaluator {
  constructor(private readonly ruleTypes: CFRuleTypeRegistry) {}

  evaluate(rules: readonly CFRule[], input: CellInput, stats: ColumnStats, ctx: EvalCtx): CFCellVerdict {
    const scoped = sortRules(rules.filter((r) => scopeMatches(r, input)));
    let background: RuleVerdict | undefined;
    const decorators: RuleVerdict[] = [];
    const wonOver: string[] = [];
    let stoppedAt: string | undefined;

    for (const rule of scoped) {
      const pred = predicateFor(this.ruleTypes, rule.when.type);
      if (!pred) continue; // 미지 조건 타입 skip(하위호환 진화, §1-inv6)
      let fired = false;
      try {
        fired = pred.test(rule.when as never, input, stats, ctx);
      } catch {
        fired = false; // 술어 예외는 격리(never-throw) — 미발화 취급
      }
      if (!fired) continue;

      const datum = computeDatum(rule.encode, input.value, stats);
      const lineage: RuleLineage = {
        ruleId: rule.id,
        conditionType: rule.when.type,
        threshold: thresholdOf(rule),
        inputValue: input.value,
        statsUsed: snapshotStats(stats),
        priority: rule.priority,
        wonOver: [],
      };
      const verdict: RuleVerdict = {
        ruleId: rule.id,
        fired: true,
        encode: rule.encode,
        datum,
        ...(rule.style !== undefined ? { styleRef: rule.style } : {}),
        lineage,
      };

      if (rule.encode.kind === 'bar' || rule.encode.kind === 'scale') {
        if (background) wonOver.push(background.ruleId);
        background = verdict; // last-wins = 최상위(priority 큰 쪽이 위)
      } else {
        decorators.push(verdict);
      }

      if (rule.stopIfTrue) {
        stoppedAt = rule.id;
        break; // 전역 순서 단락(엑셀 Stop-If-True)
      }
    }

    // 배경 승자에 wonOver 반영(계보 정직성).
    if (background && wonOver.length) {
      background = { ...background, lineage: { ...background.lineage, wonOver: [...wonOver] } };
    }
    const winner = background ?? decorators[0];

    const out: {
      background?: RuleVerdict;
      decorators: readonly RuleVerdict[];
      winner?: RuleVerdict;
      stoppedAt?: string;
    } = { decorators };
    if (background) out.background = background;
    if (winner) out.winner = winner;
    if (stoppedAt !== undefined) out.stoppedAt = stoppedAt;
    return out;
  }
}

/** 규칙 조건에서 계보용 임계 스칼라 추출. / Extract lineage threshold scalars from a rule's condition. */
function thresholdOf(rule: CFRule): Readonly<Record<string, unknown>> {
  const { type, ...rest } = rule.when as Record<string, unknown> & { type: string };
  return rest;
}
