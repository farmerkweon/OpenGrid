// DD-05 §2.5·§3 CFEngine.paintFor 왕복 — 인코더 VisualSpec(ariaSummary 필수·ink AA·이중부호화)
import { describe, it, expect } from 'vitest';
import {
  CFEngine,
  CFRuleStore,
  computeColumnStats,
  staticAppearanceView,
  type CFRule,
  type CellInput,
  type EvalCtx,
} from '../../../src/core/cf/index.js';
import { makeRect } from '../../../src/core/coordinate/index.js';
import { contrastRatio } from '../../../src/core/chart/palette.js';

const ctx: EvalCtx = { now: Date.UTC(2026, 6, 12) };
const rect = makeRect(0, 0, 120, 24);
const view = staticAppearanceView();

function input(value: unknown, columnId = 'amt'): CellInput {
  return { value, rowIndex: 0, columnId, rowState: 'none' };
}

describe('DD-05 §3 UC-1 데이터바 — 평가⟂적용 왕복', () => {
  const stats = computeColumnStats([-100, -50, 0, 50, 100]);

  it('bar → 배경 VisualSpec(fill.ratio·from·inkColor·ariaSummary)', () => {
    const rule: CFRule = { id: 'bar', when: { type: 'compare', op: '!=', a: NaN }, encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'amt' }, priority: 0 };
    // compare !=NaN 은 항상 true(값!=NaN) → 열 전체 데이터바.
    const eng = new CFEngine(new CFRuleStore([rule]));
    const specs = eng.paintFor(input(50), stats, view, rect, ctx);
    expect(specs).toHaveLength(1);
    const s = specs[0]!;
    expect(s.layer).toBe('background');
    expect(s.fill?.ratio).toBeCloseTo(0.5, 5);
    expect(s.fill?.from).toBe('left'); // 양수
    expect(s.ariaSummary).toContain('값 50');
    // 채움 위 텍스트 AA 보증.
    expect(contrastRatio(s.inkColor, s.fill!.color)).toBeGreaterThanOrEqual(4.5);
  });

  it('음수 → from=right·ariaSummary 음수 고지', () => {
    const rule: CFRule = { id: 'bar', when: { type: 'compare', op: '<', a: 0 }, encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'amt' }, priority: 0 };
    const eng = new CFEngine(new CFRuleStore([rule]));
    const s = eng.paintFor(input(-100), stats, view, rect, ctx)[0]!;
    expect(s.fill?.from).toBe('right');
    expect(s.fill?.ratio).toBeCloseTo(1, 5);
    expect(s.ariaSummary).toContain('음수');
  });

  // 발주자 지적 시정: 음수는 색+방향 이중부호가 성립하도록 양수와 다른 데이터색(--og-cf-bar-neg=graphite).
  it('음수/양수 데이터바는 다른 색 — 색+방향 이중부호(danger 재사용 아님)', () => {
    const rule: CFRule = { id: 'bar', when: { type: 'compare', op: '!=', a: NaN }, encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'amt' }, priority: 0 };
    const eng = new CFEngine(new CFRuleStore([rule]));
    // staticAppearanceView 기본: primary #1976d2(양수 seed) / graphite #3a3f45(음수 --og-cf-bar-neg).
    const seeds = staticAppearanceView();
    const pos = eng.paintFor(input(50), stats, seeds, rect, ctx)[0]!;
    const neg = eng.paintFor(input(-100), stats, seeds, rect, ctx)[0]!;
    expect(pos.fill?.color).toBe(seeds.rampFrom('primary'));
    expect(neg.fill?.color).toBe(seeds.rampFrom('graphite'));
    expect(neg.fill?.color).not.toBe(pos.fill?.color); // 음수·양수 색 분리
    // 음수는 danger 의미색(빨강)이 아니라 무채색 데이터색.
    expect(neg.fill?.color).not.toMatch(/^#d3/i);
  });
});

describe('DD-05 §9.5 정직성 — 모든 VisualSpec 은 ariaSummary(텍스트 쌍둥이) 필수', () => {
  const stats = computeColumnStats([0, 25, 50, 75, 100]);

  it('scale/icon/sparkline 모두 비어있지 않은 ariaSummary', () => {
    const rules: CFRule[] = [
      { id: 'sc', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'scale' }, scope: { columnId: 'amt' }, priority: 1 },
      { id: 'ic', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'icon', setId: 'arrows' }, scope: { columnId: 'amt' }, priority: 2 },
      { id: 'sp', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'sparkline', chart: 'line' }, scope: { columnId: 'amt' }, priority: 3 },
    ];
    const eng = new CFEngine(new CFRuleStore(rules));
    const specs = eng.paintFor(input(75), stats, view, rect, ctx);
    expect(specs.length).toBe(3);
    for (const s of specs) expect(s.ariaSummary.length).toBeGreaterThan(0);
  });

  it('icon 이중부호화 — tint(색) ⟂ shape(형태), 상/하위 형태 구분', () => {
    const hi: CFRule = { id: 'ic', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'icon', setId: 'arrows', steps: 3 }, scope: { columnId: 'amt' }, priority: 0 };
    const eng = new CFEngine(new CFRuleStore([hi]));
    const top = eng.paintFor(input(100), stats, view, rect, ctx)[0]!;
    const bot = eng.paintFor(input(0), stats, view, rect, ctx)[0]!;
    expect(top.glyph?.shape).toBe('triangleUp');
    expect(bot.glyph?.shape).toBe('triangleDown');
    expect(top.glyph?.tint).toBeDefined();
    // 색과 형태가 독립: 형태만으로 상/하위 판독 가능.
    expect(top.glyph?.shape).not.toBe(bot.glyph?.shape);
  });
});

describe('DD-05 §3 UC-3 scale 히트맵 — 이산 채움 + AA 잉크', () => {
  it('scale discrete → fill 색 + AA 보증 inkColor', () => {
    const stats = computeColumnStats([0, 100]);
    const rule: CFRule = { id: 'hm', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'scale', mode: 'discrete', bands: 5 }, scope: { columnId: 'amt' }, priority: 0 };
    const eng = new CFEngine(new CFRuleStore([rule]));
    const s = eng.paintFor(input(100), stats, view, rect, ctx)[0]!;
    expect(s.fill?.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastRatio(s.inkColor, s.fill!.color)).toBeGreaterThanOrEqual(4.5);
    expect(s.ariaSummary).toContain('구간');
  });
});

describe('DD-05 §9.5 정직성 — 결측(missing) 값은 최소 밴드로 위장하지 않는다', () => {
  const stats = computeColumnStats([0, 25, 50, 75, 100]);

  // 수치 술어(compare/topN…)는 결측에 미발화하므로, 결측 위 인코딩은 textContains/custom 경유로만 도달.
  // 빈 textContains 는 모든 값(널 포함)에 발화 → 결측 셀에 scale/icon 이 얹히는 실제 경로를 재현한다.
  it('scale/icon — 결측은 band[0] 채움·▽하위 아이콘이 아니라 채움/글리프 없음 + "값 없음"', () => {
    const rules: CFRule[] = [
      { id: 'sc', when: { type: 'textContains', text: '' }, encode: { kind: 'scale', bands: 5 }, scope: { columnId: 'amt' }, priority: 1 },
      { id: 'ic', when: { type: 'textContains', text: '' }, encode: { kind: 'icon', setId: 'arrows', steps: 3 }, scope: { columnId: 'amt' }, priority: 2 },
    ];
    const eng = new CFEngine(new CFRuleStore(rules));
    const specs = eng.paintFor(input(null), stats, view, rect, ctx);
    expect(specs.length).toBe(2);
    for (const s of specs) {
      expect(s.fill).toBeUndefined(); // 히트맵 최소색으로 위장 금지
      expect(s.glyph).toBeUndefined(); // ▽ 하위 아이콘으로 위장 금지
      expect(s.ariaSummary).toBe('값 없음'); // 정직한 텍스트 쌍둥이
    }
  });

  it('bar — 결측은 길이 0 막대가 아니라 채움 없음 + "값 없음"(0 값과 구분)', () => {
    const rule: CFRule = { id: 'bar', when: { type: 'textContains', text: '' }, encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'amt' }, priority: 0 };
    const eng = new CFEngine(new CFRuleStore([rule]));
    const miss = eng.paintFor(input('—'), stats, view, rect, ctx)[0]!;
    expect(miss.fill).toBeUndefined();
    expect(miss.ariaSummary).toBe('값 없음');
    // 실제 0 값은 길이 0 막대(값 있음)로 정직 표시 — 결측과 다르다.
    const zero = eng.paintFor(input(0), stats, view, rect, ctx)[0]!;
    expect(zero.fill?.ratio).toBe(0);
    expect(zero.ariaSummary).toContain('값 0');
  });
});

describe('DD-05 규칙 0 → 페인트 0(semver 하위호환·기본외관 불변)', () => {
  it('빈 규칙 저장소는 VisualSpec 미산출', () => {
    const eng = new CFEngine(new CFRuleStore([]));
    expect(eng.paintFor(input(50), computeColumnStats([50]), view, rect, ctx)).toEqual([]);
  });
});
