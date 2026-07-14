// DD-05 §2.2·§2.3 조건 술어·순수 평가·우선순위·Stop-If-True·스코프·계보·statsNeeds
import { describe, it, expect } from 'vitest';
import {
  DefaultCFEvaluator,
  createRuleTypeRegistry,
  computeColumnStats,
  computeDatum,
  scopeMatches,
  CFEngine,
  CFRuleStore,
  type CFRule,
  type CellInput,
  type EvalCtx,
} from '../../../src/core/cf/index.js';

const ctx: EvalCtx = { now: Date.UTC(2026, 6, 12, 12, 0, 0) };

function input(value: unknown, rowIndex = 0, columnId = 'amt', rowState: CellInput['rowState'] = 'none'): CellInput {
  return { value, rowIndex, columnId, rowState };
}

function rule(partial: Partial<CFRule> & Pick<CFRule, 'id' | 'when'>): CFRule {
  return {
    encode: { kind: 'bar' },
    scope: { columnId: 'amt' },
    priority: 0,
    ...partial,
  } as CFRule;
}

describe('DD-05 조건 술어 카탈로그(9종)', () => {
  const ev = new DefaultCFEvaluator(createRuleTypeRegistry());
  const col = [10, 20, 30, 40, 50];
  const stats = computeColumnStats(col);

  it('compare — >, between', () => {
    const gt = rule({ id: 'r1', when: { type: 'compare', op: '>', a: 25 } });
    expect(ev.evaluate([gt], input(30), stats, ctx).winner?.ruleId).toBe('r1');
    expect(ev.evaluate([gt], input(20), stats, ctx).winner).toBeUndefined();
    const bt = rule({ id: 'r2', when: { type: 'compare', op: 'between', a: 15, b: 35 } });
    expect(ev.evaluate([bt], input(20), stats, ctx).winner?.ruleId).toBe('r2');
    expect(ev.evaluate([bt], input(40), stats, ctx).winner).toBeUndefined();
  });

  it('textContains — 대소문자 무시 기본', () => {
    const ev2 = new DefaultCFEvaluator(createRuleTypeRegistry());
    const r = rule({ id: 't', when: { type: 'textContains', text: 'err' }, scope: { columnId: 'msg' } });
    const s = computeColumnStats([]);
    expect(ev2.evaluate([r], input('Internal ERROR', 0, 'msg'), s, ctx).winner?.ruleId).toBe('t');
    expect(ev2.evaluate([r], input('ok', 0, 'msg'), s, ctx).winner).toBeUndefined();
  });

  it('topN / bottomN — 순위 기반', () => {
    const top2 = rule({ id: 'top', when: { type: 'topN', n: 2 } });
    expect(ev.evaluate([top2], input(50), stats, ctx).winner?.ruleId).toBe('top'); // rank1
    expect(ev.evaluate([top2], input(40), stats, ctx).winner?.ruleId).toBe('top'); // rank2
    expect(ev.evaluate([top2], input(30), stats, ctx).winner).toBeUndefined();     // rank3
    const bot1 = rule({ id: 'bot', when: { type: 'topN', n: 1, bottom: true } });
    expect(ev.evaluate([bot1], input(10), stats, ctx).winner?.ruleId).toBe('bot');
    expect(ev.evaluate([bot1], input(20), stats, ctx).winner).toBeUndefined();
  });

  it('topNpct — 상위/하위 분위', () => {
    const top20 = rule({ id: 'p', when: { type: 'topNpct', pct: 20 } });
    expect(ev.evaluate([top20], input(50), stats, ctx).winner?.ruleId).toBe('p'); // percentile 1.0
    expect(ev.evaluate([top20], input(10), stats, ctx).winner).toBeUndefined();
  });

  it('aboveAvg / below', () => {
    const above = rule({ id: 'a', when: { type: 'aboveAvg' } }); // avg=30
    expect(ev.evaluate([above], input(40), stats, ctx).winner?.ruleId).toBe('a');
    expect(ev.evaluate([above], input(20), stats, ctx).winner).toBeUndefined();
    const below = rule({ id: 'b', when: { type: 'aboveAvg', below: true } });
    expect(ev.evaluate([below], input(20), stats, ctx).winner?.ruleId).toBe('b');
  });

  it('stdBand — ±kσ 이상치', () => {
    const s = computeColumnStats([1, 2, 3, 4, 5]); // avg 3, stddev ~1.414
    const outside = rule({ id: 'o', when: { type: 'stdBand', k: 1 } });
    expect(ev.evaluate([outside], input(5), s, ctx).winner?.ruleId).toBe('o'); // |5-3|=2 >= 1.414
    expect(ev.evaluate([outside], input(3), s, ctx).winner).toBeUndefined();   // 0 < 1.414
    const inside = rule({ id: 'i', when: { type: 'stdBand', k: 1, outside: false } });
    expect(ev.evaluate([inside], input(3), s, ctx).winner?.ruleId).toBe('i');
  });

  it('duplicate / unique — 카디널리티', () => {
    const s = computeColumnStats([1, 1, 2, 3]);
    const dup = rule({ id: 'd', when: { type: 'duplicate' } });
    expect(ev.evaluate([dup], input(1), s, ctx).winner?.ruleId).toBe('d');
    expect(ev.evaluate([dup], input(2), s, ctx).winner).toBeUndefined();
    const uniq = rule({ id: 'u', when: { type: 'duplicate', unique: true } });
    expect(ev.evaluate([uniq], input(2), s, ctx).winner?.ruleId).toBe('u');
  });

  it('dateOccurring — now 주입으로 결정론(오늘/이번주)', () => {
    const s = computeColumnStats([]);
    const today = rule({ id: 'dt', when: { type: 'dateOccurring', rel: 'today' }, scope: { columnId: 'd' } });
    const todayMs = Date.UTC(2026, 6, 12, 3, 0, 0);
    expect(ev.evaluate([today], input(new Date(todayMs), 0, 'd'), s, ctx).winner?.ruleId).toBe('dt');
    const other = new Date(Date.UTC(2026, 6, 1));
    expect(ev.evaluate([today], input(other, 0, 'd'), s, ctx).winner).toBeUndefined();
  });
});

describe('DD-05 우선순위·Stop-If-True·층 분리', () => {
  const ev = new DefaultCFEvaluator(createRuleTypeRegistry());
  const stats = computeColumnStats([10, 20, 30, 40, 50]);

  it('배경 승자는 priority 큰(나중 평가) 규칙 — last-wins·최상위', () => {
    const low = rule({ id: 'low', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'scale' }, priority: 1 });
    const high = rule({ id: 'high', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'scale' }, priority: 5 });
    const v = ev.evaluate([high, low], input(30), stats, ctx);
    expect(v.background?.ruleId).toBe('high');
    expect(v.winner?.ruleId).toBe('high');
    // 계보: high 가 low 를 이겼다.
    expect(v.background?.lineage.wonOver).toContain('low');
  });

  it('동일 priority 는 id 사전순 tie-break(결정론)', () => {
    const a = rule({ id: 'aaa', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'bar' }, priority: 2 });
    const b = rule({ id: 'bbb', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'bar' }, priority: 2 });
    const v = ev.evaluate([b, a], input(30), stats, ctx);
    expect(v.background?.ruleId).toBe('bbb'); // 나중 평가(id 큰)가 최상위
  });

  it('Stop-If-True — 이후 규칙 전역 단락', () => {
    const stop = rule({ id: 'stop', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'scale' }, priority: 1, stopIfTrue: true });
    const after = rule({ id: 'after', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'scale' }, priority: 9 });
    const v = ev.evaluate([stop, after], input(30), stats, ctx);
    expect(v.stoppedAt).toBe('stop');
    expect(v.background?.ruleId).toBe('stop'); // after 는 평가 안 됨
  });

  it('층 분리 — bar|scale=배경, icon|sparkline=데코 다중', () => {
    const bg = rule({ id: 'bg', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'scale' }, priority: 1 });
    const ic = rule({ id: 'ic', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'icon', setId: 'arrows' }, priority: 2 });
    const sp = rule({ id: 'sp', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'sparkline' }, priority: 3 });
    const v = ev.evaluate([bg, ic, sp], input(30), stats, ctx);
    expect(v.background?.ruleId).toBe('bg');
    expect(v.decorators.map((d) => d.ruleId)).toEqual(['ic', 'sp']);
  });
});

describe('DD-05 스코프 매칭', () => {
  it('columnId·행범위·행상태 게이트', () => {
    const r = rule({ id: 'r', when: { type: 'compare', op: '>', a: 0 }, scope: { columnId: 'amt', range: { startRow: 2, endRow: 5 }, rowState: 'added' } });
    expect(scopeMatches(r, input(1, 3, 'amt', 'added'))).toBe(true);
    expect(scopeMatches(r, input(1, 3, 'other', 'added'))).toBe(false); // 컬럼 불일치
    expect(scopeMatches(r, input(1, 1, 'amt', 'added'))).toBe(false);   // 범위 밖
    expect(scopeMatches(r, input(1, 3, 'amt', 'none'))).toBe(false);    // 행상태 불일치
  });
});

describe('DD-05 미지 조건 타입 skip(하위호환)', () => {
  it('등록 안 된 when.type 은 발화하지 않고 나머지 규칙은 정상', () => {
    const ev = new DefaultCFEvaluator(createRuleTypeRegistry());
    const stats = computeColumnStats([10, 20, 30]);
    const unknown = rule({ id: 'x', when: { type: 'futureType' } as never });
    const known = rule({ id: 'k', when: { type: 'compare', op: '>', a: 0 }, priority: 5 });
    const v = ev.evaluate([unknown, known], input(20), stats, ctx);
    expect(v.winner?.ruleId).toBe('k');
  });
});

describe('DD-05 computeDatum — 0기준·음수 양방향·클램프·이산 구간', () => {
  const stats = computeColumnStats([-100, -50, 0, 50, 100]);

  it('bar 0기준 — 부호·정규화비율(|v|/maxAbs)', () => {
    const pos = computeDatum({ kind: 'bar', axis: 'zero' }, 50, stats);
    expect(pos.sign).toBe(1);
    expect(pos.ratio).toBeCloseTo(0.5, 5);
    const neg = computeDatum({ kind: 'bar', axis: 'zero' }, -100, stats);
    expect(neg.sign).toBe(-1);
    expect(neg.ratio).toBeCloseTo(1, 5);
  });

  it('bar 클램프 — 범위 초과 고지', () => {
    const s = computeColumnStats([0, 10]);
    const d = computeDatum({ kind: 'bar', axis: 'min', clamp: true }, 50, s);
    expect(d.ratio).toBe(1);
    expect(d.clamped).toBe(true);
  });

  it('scale 이산 3단 기본 — 구간 인덱스', () => {
    const s = computeColumnStats([0, 100]);
    expect(computeDatum({ kind: 'scale' }, 0, s).bandIndex).toBe(0);
    expect(computeDatum({ kind: 'scale' }, 50, s).bandIndex).toBe(1);
    expect(computeDatum({ kind: 'scale' }, 100, s).bandIndex).toBe(2);
    expect(computeDatum({ kind: 'scale' }, 100, s).bandCount).toBe(3);
  });

  it('scale 발산 — bandCount 최소 3단(중립 밴드 보존, ColorScale 정합·T5-013)', () => {
    const s = computeColumnStats([0, 100]);
    // 발산 bands:2 요청도 최소 3단으로 정합 — 최댓값이 중립색으로 왜곡되지 않도록.
    const d = computeDatum({ kind: 'scale', diverging: true, bands: 2, midpoint: 50 }, 100, s);
    expect(d.bandCount).toBe(3);
    expect(d.bandIndex).toBe(2); // 최댓값은 고(高)측 밴드, 중립(1) 아님
  });
});

describe('DD-05 CFEngine — statsNeedsFor·계보 explain', () => {
  it('statsNeedsFor — 컬럼 규칙 needs 합집합', () => {
    const store = new CFRuleStore([
      rule({ id: 'a', when: { type: 'aboveAvg' } }),           // needs avg
      rule({ id: 't', when: { type: 'topN', n: 2 } }),          // needs rank
      rule({ id: 's', when: { type: 'stdBand', k: 1 } }),       // needs avg,stddev
    ]);
    const eng = new CFEngine(store);
    expect(eng.statsNeedsFor('amt').sort()).toEqual(['avg', 'rank', 'stddev']);
  });

  it('explain — 발화 규칙 계보(임계·입력값) 반환', () => {
    const rules = [rule({ id: 'r', when: { type: 'compare', op: '>', a: 25 } })];
    const eng = new CFEngine(new CFRuleStore(rules));
    const stats = computeColumnStats([10, 30]);
    const lin = eng.explain(input(30), rules, stats, ctx);
    expect(lin).toHaveLength(1);
    expect(lin[0]!.ruleId).toBe('r');
    expect(lin[0]!.inputValue).toBe(30);
    expect(lin[0]!.threshold).toMatchObject({ op: '>', a: 25 });
  });
});
