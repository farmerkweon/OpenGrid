// ============================================================
// DD-08 §2.3 — FunctionRegistry + ESSENTIAL_FUNCTIONS 유닛테스트
// 못박는 계약: register/get/has/list/child·fail-fast 오버라이드(§R.5)·tier 분리·
//   ★핵심 오라클: 레지스트리 ESSENTIAL_FUNCTIONS 평가 == 내장 switch 평가(셀 단위 동일).
//   확장 함수 seam·override 가 실제 평가에 반영됨(evaluate opt-in seam).
// ============================================================
import { describe, it, expect } from 'vitest';
import { OGDecimal } from '../../../src/core/OGDecimal.js';
import { TieredFunctionRegistry, normalizeFnName, type FunctionDef } from '../../../src/core/formula/FunctionRegistry.js';
import { ESSENTIAL_FUNCTIONS } from '../../../src/core/formula/functions/essential.js';
import { EXTENDED_FUNCTIONS, registerExtendedFunctions } from '../../../src/core/formula/functions/extended/index.js';
import { RecalcCoordinator } from '../../../src/core/formula/RecalcCoordinator.js';
import { cellKey, type CellValue } from '../../../src/core/formula/types.js';
import { MockGridAccessor } from './testAccessor.js';

function num(v: CellValue): string {
  return v instanceof OGDecimal ? v.toString() : String(v);
}

// ── 레지스트리 계약 ─────────────────────────────────────────
describe('TieredFunctionRegistry — 등록/조회/tier/child(§2.3)', () => {
  const noop: FunctionDef = { name: 'FOO', tier: 'extended', arity: { min: 0, max: 0 }, evaluate: () => null };

  it('register→get/has 는 대문자 정규화되어 동작', () => {
    const r = new TieredFunctionRegistry();
    r.register({ ...noop, name: 'foo' });
    expect(r.has('FOO')).toBe(true);
    expect(r.has('foo')).toBe(true);
    expect(r.get('Foo')?.name).toBe('foo');
    expect(normalizeFnName(' sum ')).toBe('SUM');
  });

  it('기존 이름 재등록은 fail-fast(override 미지정 시 throw, §R.5)', () => {
    const r = new TieredFunctionRegistry();
    r.register(noop);
    expect(() => r.register(noop)).toThrow(/이미 등록/);
    expect(() => r.register({ ...noop, evaluate: () => 'x' }, { override: true })).not.toThrow();
    expect(r.get('FOO')?.evaluate([], {} as never)).toBe('x');
  });

  it('list(tier) 는 tier 별로 거른다', () => {
    const r = new TieredFunctionRegistry();
    for (const d of ESSENTIAL_FUNCTIONS) r.register(d);
    for (const d of EXTENDED_FUNCTIONS) r.register(d);
    expect(r.list('essential').length).toBe(ESSENTIAL_FUNCTIONS.length);
    expect(r.list('extended').length).toBe(EXTENDED_FUNCTIONS.length);
    expect(r.list().length).toBe(ESSENTIAL_FUNCTIONS.length + EXTENDED_FUNCTIONS.length);
  });

  it('child() 는 부모 폴백 + 로컬 오버라이드(전역 오염 없음)', () => {
    const parent = new TieredFunctionRegistry();
    parent.register(noop);
    const child = parent.child();
    expect(child.has('FOO')).toBe(true);               // 부모 폴백
    child.register({ ...noop, evaluate: () => 'child' }, { override: true });
    expect(child.get('FOO')?.evaluate([], {} as never)).toBe('child');
    expect(parent.get('FOO')?.evaluate([], {} as never)).toBe(null); // 부모 불변(격리)
  });

  it('빈 이름 등록은 거부', () => {
    const r = new TieredFunctionRegistry();
    expect(() => r.register({ ...noop, name: '   ' })).toThrow();
  });
});

// ── ★ 오라클: ESSENTIAL_FUNCTIONS(레지스트리 경로) == 내장 switch ──
describe('ESSENTIAL_FUNCTIONS ≡ 내장 switch (셀 단위 동일, 회귀 가드)', () => {
  const FORMULAS = [
    '=SUM([a],[b],[c])',
    '=AVG([a],[b],[c])',
    '=AVERAGE([a],[b],[c])',
    '=MIN([a],[b],[c])',
    '=MAX([a],[b],[c])',
    '=COUNT([a],[b],[c])',
    '=COUNTA([a],[b],[c])',
    '=IF([a]>2,10,20)',
    '=AND([a]>0,[b]>0)',
    '=OR([a]>100,[b]>0)',
    '=NOT([a]>100)',
    '=ROUND([b]/[c],3)',
    '=ROUNDUP([b]/[c],2)',
    '=ROUNDDOWN([b]/[c],2)',
    '=ABS(0-[a])',
    '=INT([b]/[c])',
    '=MOD([b],[c])',
    '=POWER([a],3)',
    '=SQRT([b])',
    '=CONCAT([a],"-",[c])',
    '=ROUND(SUM([a],[b],[c])/3,4)',
  ];

  function setup(withRegistry: boolean) {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b'); g.addColumn('c'); g.addColumn('out');
    g.addRow('r1', { a: 3, b: 10, c: 4 });
    const opts: ConstructorParameters<typeof RecalcCoordinator>[0] = {
      accessor: g,
      setComputedValue: (rowId, field, value) => g.setValue(rowId, field, value),
    };
    if (withRegistry) {
      const reg = new TieredFunctionRegistry();
      for (const d of ESSENTIAL_FUNCTIONS) reg.register(d);
      opts.functions = reg;
    }
    return { g, coord: new RecalcCoordinator(opts) };
  }

  it('전 배터리에서 두 경로의 계산값이 일치', () => {
    for (const f of FORMULAS) {
      const builtin = setup(false);
      const registry = setup(true);
      const s1 = builtin.coord.setCellFormula('r1', 'out', f);
      const s2 = registry.coord.setCellFormula('r1', 'out', f);
      const v1 = builtin.g.getCellValue('r1', 'out') as CellValue;
      const v2 = registry.g.getCellValue('r1', 'out') as CellValue;
      expect(num(v2), `formula ${f}`).toBe(num(v1));
      expect(s2.cycles).toBe(s1.cycles);
    }
  });
});

// ── 확장 함수 seam(지연 등록 시에만 활성) ─────────────────────
describe('EXTENDED_FUNCTIONS — opt-in 확장(§4)', () => {
  function coordWith(reg?: TieredFunctionRegistry) {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b'); g.addColumn('c'); g.addColumn('out');
    g.addRow('r1', { a: 6, b: 2, c: 4 });
    const opts: ConstructorParameters<typeof RecalcCoordinator>[0] = {
      accessor: g, setComputedValue: (rid, fld, v) => g.setValue(rid, fld, v),
    };
    if (reg) opts.functions = reg;
    return { g, coord: new RecalcCoordinator(opts) };
  }

  it('미등록 시 확장 함수는 #NAME', () => {
    const reg = new TieredFunctionRegistry();
    for (const d of ESSENTIAL_FUNCTIONS) reg.register(d);
    const { g, coord } = coordWith(reg);
    coord.setCellFormula('r1', 'out', '=MEDIAN([a],[b],[c])');
    expect(coord.getCellError('r1', 'out')).toBe('#NAME');
    expect(g.getCellValue('r1', 'out')).toBe('#NAME');
  });

  it('registerExtendedFunctions 후 PRODUCT/MEDIAN/IFERROR 동작', () => {
    const reg = new TieredFunctionRegistry();
    for (const d of ESSENTIAL_FUNCTIONS) reg.register(d);
    registerExtendedFunctions(reg);
    const { g, coord } = coordWith(reg);
    coord.setCellFormula('r1', 'out', '=PRODUCT([a],[b],[c])'); // 6*2*4=48
    expect(num(g.getCellValue('r1', 'out') as CellValue)).toBe('48');
    coord.setCellFormula('r1', 'out', '=MEDIAN([a],[b],[c])');  // median(6,2,4)=4
    expect(num(g.getCellValue('r1', 'out') as CellValue)).toBe('4');
    coord.setCellFormula('r1', 'out', '=IFERROR([b]/0,999)');   // #DIV0 → 999
    expect(num(g.getCellValue('r1', 'out') as CellValue)).toBe('999');
    coord.setCellFormula('r1', 'out', '=IFERROR([a],999)');     // 정상 → 6
    expect(num(g.getCellValue('r1', 'out') as CellValue)).toBe('6');
  });

  it('확장 함수가 내장 함수의 인자로 중첩돼도 해소된다(seam 전파)', () => {
    const reg = new TieredFunctionRegistry();
    for (const d of ESSENTIAL_FUNCTIONS) reg.register(d);
    registerExtendedFunctions(reg);
    const { g, coord } = coordWith(reg);
    coord.setCellFormula('r1', 'out', '=ROUND(MEDIAN([a],[b],[c]),0)'); // ROUND(4,0)=4
    expect(coord.getCellError('r1', 'out')).toBe(null);
    expect(num(g.getCellValue('r1', 'out') as CellValue)).toBe('4');
  });
});

// ── override(코어 함수 교체, §R.5) ─────────────────────────────
describe('함수 override — 코어 SUM 교체(§R.5, C1)', () => {
  it('register(SUM,{override}) 가 실제 평가에 반영', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b'); g.addColumn('out');
    g.addRow('r1', { a: 3, b: 5 });
    const reg = new TieredFunctionRegistry();
    for (const d of ESSENTIAL_FUNCTIONS) reg.register(d);
    // SUM 을 "합계+1000" 사내 규칙으로 교체.
    reg.register({
      name: 'SUM', tier: 'essential', arity: { min: 1, max: 'variadic' },
      evaluate: (_a, ctx) => {
        const base = OGDecimal.sum(ctx.collect().map((v) => ctx.toNum(v)));
        return base.add(OGDecimal.from('1000'));
      },
    }, { override: true });
    const coord = new RecalcCoordinator({ accessor: g, functions: reg, setComputedValue: (rid, fld, v) => g.setValue(rid, fld, v) });
    coord.setCellFormula('r1', 'out', '=SUM([a],[b])'); // 3+5+1000
    expect(num(g.getCellValue('r1', 'out') as CellValue)).toBe('1008');
  });
});
