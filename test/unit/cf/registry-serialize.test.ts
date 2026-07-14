// DD-05 §2.6·§4.7 등록 SPI(교체·확장·builtin 보호) + 직렬화 로더(미지 규칙 skip)
import { describe, it, expect } from 'vitest';
import {
  createRuleTypeRegistry,
  createEncoderRegistry,
  createNamedStyleRegistry,
  DefaultCFRuleLoader,
  DefaultCFEvaluator,
  computeColumnStats,
  serializeRules,
  type CFPredicate,
  type CFEncoder,
  type CFRule,
  type CellInput,
  type EvalCtx,
} from '../../../src/core/cf/index.js';

const ctx: EvalCtx = { now: Date.UTC(2026, 6, 12) };
const cell: CellInput = { value: 42, rowIndex: 0, columnId: 'amt', rowState: 'none' };

describe('DD-05 §4.7 조건 술어 레지스트리 — builtin 보호·교체·확장', () => {
  it('내장 8종 + custom 등록됨', () => {
    const reg = createRuleTypeRegistry();
    for (const t of ['compare', 'textContains', 'dateOccurring', 'topN', 'topNpct', 'aboveAvg', 'stdBand', 'duplicate', 'custom']) {
      expect(reg.has(t)).toBe(true);
    }
  });

  it('builtin 은 override 없이 교체 거부(코어 보호)', () => {
    const reg = createRuleTypeRegistry();
    const fake: CFPredicate = { needs: [], test: () => true };
    const r = reg.register('compare', fake); // origin user, override 미지정
    expect(r.action).toBe('kept');
    // 기존 compare 유지: 42 > 100 은 false.
    expect(reg.get('compare')!.test({ type: 'compare', op: '>', a: 100 } as never, cell, computeColumnStats([]), ctx)).toBe(false);
  });

  it('override:true 로 기본 인코더/술어 교체(last-wins)', () => {
    const reg = createRuleTypeRegistry();
    const always: CFPredicate = { needs: [], test: () => true };
    const r = reg.register('compare', always, { override: true });
    expect(r.action).toBe('replaced');
    expect(reg.get('compare')!.test({ type: 'compare', op: '>', a: 100 } as never, cell, computeColumnStats([]), ctx)).toBe(true);
  });

  it('신규 custom 술어 확장 → 평가기가 사용', () => {
    const reg = createRuleTypeRegistry();
    const even: CFPredicate = { needs: [], test: (_c, inp) => typeof inp.value === 'number' && inp.value % 2 === 0 };
    reg.register('isEven', even);
    const ev = new DefaultCFEvaluator(reg);
    const rule: CFRule = { id: 'e', when: { type: 'isEven' } as never, encode: { kind: 'bar' }, scope: { columnId: 'amt' }, priority: 0 };
    expect(ev.evaluate([rule], cell, computeColumnStats([]), ctx).winner?.ruleId).toBe('e');
  });
});

describe('DD-05 §4.7 인코더 레지스트리 — 4종 내장·교체', () => {
  it('bar/scale/icon/sparkline 내장', () => {
    const reg = createEncoderRegistry();
    for (const k of ['bar', 'scale', 'icon', 'sparkline']) expect(reg.get(k)).toBeDefined();
  });

  it('기본 bar 인코더 교체(override)', () => {
    const reg = createEncoderRegistry();
    const custom: CFEncoder = { kind: 'bar', encode: () => ({ layer: 'background', inkColor: '#000', ariaSummary: 'custom' }) };
    expect(reg.register('bar', custom, { override: true }).action).toBe('replaced');
    expect(reg.get('bar')).toBe(custom);
  });
});

describe('DD-05 §2.6 직렬화 로더 — 미지 규칙 skip + SkipReport', () => {
  const loader = new DefaultCFRuleLoader();
  const reg = { types: createRuleTypeRegistry(), encoders: createEncoderRegistry(), styles: createNamedStyleRegistry() };

  it('유효 규칙은 로드, 미지 조건/인코더/스타일·미래버전·비정형은 skip', () => {
    reg.styles.register('brandRed', { color: '#c00' });
    const json = {
      v: 1,
      rules: [
        { id: 'ok', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'bar' }, scope: { columnId: 'amt' }, priority: 0, style: { ref: 'brandRed' } },
        { id: 'badCond', when: { type: 'quantumRule' }, encode: { kind: 'bar' }, scope: { columnId: 'amt' }, priority: 0 },
        { id: 'badEnc', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'hologram' }, scope: { columnId: 'amt' }, priority: 0 },
        { id: 'badStyle', when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'bar' }, scope: { columnId: 'amt' }, priority: 0, style: { ref: 'missingStyle' } },
        { id: 'future', v: 99, when: { type: 'compare', op: '>', a: 0 }, encode: { kind: 'bar' }, scope: { columnId: 'amt' }, priority: 0 },
        { id: 'malformed', encode: { kind: 'bar' } },
      ],
    };
    const res = loader.load(json, reg);
    expect(res.rules.map((r) => r.id)).toEqual(['ok']);
    const reasons = Object.fromEntries(res.skipped.map((s) => [s.ruleId, s.reason]));
    expect(reasons).toMatchObject({
      badCond: 'unknown-condition',
      badEnc: 'unknown-encoder',
      badStyle: 'unknown-style',
      future: 'future-version',
      malformed: 'malformed',
    });
  });

  it('직렬화 round-trip — 값객체 순수 JSON', () => {
    const rules: CFRule[] = [{ id: 'r', when: { type: 'compare', op: '>=', a: 10 }, encode: { kind: 'scale', mode: 'discrete', bands: 4 }, scope: { columnId: 'amt' }, priority: 1 }];
    const json = serializeRules(rules);
    const res = loader.load(JSON.parse(json), reg);
    expect(res.rules).toHaveLength(1);
    expect(res.rules[0]).toMatchObject({ id: 'r', encode: { kind: 'scale', bands: 4 } });
  });
});
