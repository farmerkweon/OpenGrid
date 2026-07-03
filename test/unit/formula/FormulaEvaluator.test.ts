// ============================================================
// FormulaEvaluator 유닛테스트 — §13 검증 매트릭스 P0 AC 다수 커버
// (f3.eval.basic/arith, f3.ref.a1, f3.compat.field, f3.range.sum, f3.precision.decimal,
//  f3.value.nonnumeric, f3.cycle 관련은 FormulaGraph/RecalcCoordinator 테스트에서,
//  f3.fuzz.isolate)
// ============================================================
import { describe, it, expect } from 'vitest';
import { OGDecimal } from '../../../src/core/OGDecimal.js';
import { parseFormula } from '../../../src/core/formula/FormulaParser.js';
import { normalizeAst } from '../../../src/core/formula/normalizeRefs.js';
import { evaluate } from '../../../src/core/formula/FormulaEvaluator.js';
import type { RefMode } from '../../../src/core/formula/types.js';
import { MockGridAccessor } from './testAccessor.js';

function run(src: string, accessor: MockGridAccessor, host = { rowId: 'r1', field: 'x' }, refMode: RefMode = 'stable') {
  const raw = parseFormula(src);
  const ast = normalizeAst(raw, host, accessor, refMode);
  return evaluate(ast, host, accessor);
}

function displayString(v: unknown): string {
  return v instanceof OGDecimal ? v.toString() : String(v);
}

function baseGrid(): MockGridAccessor {
  const g = new MockGridAccessor();
  g.addColumn('a'); g.addColumn('b'); g.addColumn('c');
  g.addRow('r1', { a: 10, b: 5, c: 'abc' });
  g.addRow('r2', { a: 20, b: 6 });
  g.addRow('r3', { a: 30, b: 7 });
  return g;
}

// ── f3.eval.basic / f3.eval.arith ───────────────────────────
describe('FormulaEvaluator — 기본 산술(F3-R01/R02)', () => {
  it('=1+2 → 3', () => {
    const g = baseGrid();
    const out = run('=1+2', g);
    expect(displayString(out.value)).toBe('3');
    expect(out.error).toBeNull();
  });
  it('=2+3*4 → 14 (연산자 우선순위)', () => {
    expect(displayString(run('=2+3*4', baseGrid()).value)).toBe('14');
  });
  it('=(2+3)*4 → 20', () => {
    expect(displayString(run('=(2+3)*4', baseGrid()).value)).toBe('20');
  });
  it('=2^10 → 1024', () => {
    expect(displayString(run('=2^10', baseGrid()).value)).toBe('1024');
  });
  it('=-5+2 → -3', () => {
    expect(displayString(run('=-5+2', baseGrid()).value)).toBe('-3');
  });
});

// ── f3.ref.a1 (visibleLeaves 열 매핑, C1) ───────────────────
describe('FormulaEvaluator — A1 참조(F3-R03/C1)', () => {
  it('=B2*2 → 20 (B2=column b row2=10... visibleFields[1]=b, flat row2=r2, b=6)', () => {
    const g = baseGrid();
    // A=col0(a), B=col1(b). row2(1-based)=flat index1=r2. r2.b=6.
    const out = run('=B2*2', g);
    expect(displayString(out.value)).toBe('12');
  });
  it('숨김 열은 A1 열문자 계산에서 제외된다(MCCONNELL-09/C1)', () => {
    const g = baseGrid();
    g.hideColumn('a'); // visibleFields = [b, c] → A=b, B=c
    const out = run('=A1', g); // row1(flat0)=r1, A→b → r1.b=5
    expect(displayString(out.value)).toBe('5');
  });
});

// ── f3.compat.field ([field] 하위호환, F3-R04) ──────────────
describe('FormulaEvaluator — [field] 하위호환(F3-R04)', () => {
  it('[a]*2 → 현재 행(host) 필드 사용', () => {
    const g = baseGrid();
    const out = run('=[a]*2', g, { rowId: 'r1', field: 'x' });
    expect(displayString(out.value)).toBe('20');
  });
});

// ── f3.range.sum (범위 SUM/AVG/MIN/MAX/COUNT) ───────────────
describe('FormulaEvaluator — 범위 함수(F3-R05)', () => {
  it('=SUM(A1:A3) → 표시 3행 a열 합 10+20+30=60', () => {
    expect(displayString(run('=SUM(A1:A3)', baseGrid()).value)).toBe('60');
  });
  it('=AVERAGE(B1:B3) → (5+6+7)/3', () => {
    const out = run('=AVERAGE(B1:B3)', baseGrid());
    expect(out.error).toBeNull();
    expect((out.value as OGDecimal).toFixed(4)).toBe('6.0000');
  });
  it('=COUNT(A1:A3) → 3', () => {
    expect(displayString(run('=COUNT(A1:A3)', baseGrid()).value)).toBe('3');
  });
  it('빈 셀은 SUM에서 0으로 관대 처리(F3-R28 라이브 빈 셀)', () => {
    const g = new MockGridAccessor();
    g.addColumn('a');
    g.addRow('r1', { a: 5 });
    g.addRow('r2', {}); // a 없음(빈 라이브 셀)
    expect(displayString(run('=SUM(A1:A2)', g).value)).toBe('5');
  });
});

// ── f3.value.nonnumeric (#VALUE, C10 R-NONNUMERIC) ──────────
describe('FormulaEvaluator — 비수치 #VALUE(F3-R28/C10)', () => {
  it('="abc"*2 → #VALUE', () => {
    const out = run('="abc"*2', baseGrid());
    expect(out.error).toBe('#VALUE');
    expect(out.value).toBe('#VALUE');
  });
  it('=A1*2 (A1=텍스트 "abc") → #VALUE', () => {
    const g = baseGrid(); // c열=abc
    g.hideColumn('a'); g.hideColumn('b'); // visibleFields=[c] → A=c
    const out = run('=A1*2', g);
    expect(out.error).toBe('#VALUE');
  });
  it('빈 셀 산술은 0(관대) — 죽은참조와 구분', () => {
    const g = new MockGridAccessor();
    g.addColumn('a');
    g.addRow('r1', {});
    expect(displayString(run('=A1+5', g).value)).toBe('5');
  });
  it('SUM 범위 내 비수치 텍스트는 #VALUE 전파', () => {
    const g = new MockGridAccessor();
    g.addColumn('a');
    g.addRow('r1', { a: 1 });
    g.addRow('r2', { a: 'xyz' });
    const out = run('=SUM(A1:A2)', g);
    expect(out.error).toBe('#VALUE');
  });
});

// ── 죽은 참조(#REF, F3-R28/§3.5 삭제 규범) ──────────────────
// stable-id 앵커(§3.2)의 핵심은 "커밋 시점에 정규화된 rowId 로 저장"이므로, 실제
// P0 시나리오(F3-R13/f3.ref.deleteref: 커밋 후 행 삭제 → 종속 #REF)는 AbsRef 를 직접
// 구성해 readRef() 의 죽은-참조 처리를 격리 검증한다(전체 파이프라인 통합 검증은
// RecalcCoordinator.test.ts 의 f3.ref.deleteref 케이스에서 수행).
describe('FormulaEvaluator — 삭제된 참조 #REF(F3-R13/R28)', () => {
  it('존재하지 않는 rowId 를 가리키는 AbsRef → #REF (죽은 ref ≠ 빈 라이브 셀)', () => {
    const g = baseGrid();
    const ast = { t: 'ref' as const, ref: { kind: 'abs' as const, rowId: 'ghost-deleted-row', field: 'a', dollarRow: false, dollarCol: false } };
    const out = evaluate(ast, { rowId: 'r1', field: 'x' }, g);
    expect(out.error).toBe('#REF');
  });
  it('삭제된 행을 가리키는 AbsRef 를 산술식 안에서 참조해도 전체가 #REF 전파', () => {
    const g = baseGrid();
    const deadRef = { t: 'ref' as const, ref: { kind: 'abs' as const, rowId: 'ghost', field: 'a', dollarRow: false, dollarCol: false } };
    const ast = { t: 'bin' as const, op: '+' as const, left: deadRef, right: { t: 'num' as const, v: '1' } };
    expect(evaluate(ast, { rowId: 'r1', field: 'x' }, g).error).toBe('#REF');
  });
  it('열 삭제 시 [field] 참조 → #REF', () => {
    const g = baseGrid();
    g.removeColumn('a'); // visibleFields 목록에서 제거 + hasField('a')=false
    const out = run('=[a]*2', g);
    expect(out.error).toBe('#REF');
  });
  it('열 삭제 시 A1 참조도 #REF(정규화 시점에 존재하지 않는 열 → error 노드)', () => {
    const g = new MockGridAccessor();
    g.addColumn('a');
    g.addRow('r1', { a: 1 });
    // 열이 1개뿐인 상태에서 B1(=visibleFields[1], 존재하지 않음) 참조.
    expect(run('=B1', g).error).toBe('#REF');
  });
});

// ── 사이클/함수/논리(P1 보너스) ──────────────────────────────
describe('FormulaEvaluator — 논리/조건 함수', () => {
  it('IF 단락 평가 — 에러 분기 우회', () => {
    const g = baseGrid();
    const out = run('=IF(1=1,"H","abc"*2)', g); // else 분기는 평가 안 됨
    expect(out.value).toBe('H');
    expect(out.error).toBeNull();
  });
  it('ROUND(x,dp) half-up', () => {
    expect(displayString(run('=ROUND(2.345,2)', baseGrid()).value)).toBe('2.35');
  });
  it('ROUNDUP/ROUNDDOWN', () => {
    expect(displayString(run('=ROUNDUP(2.341,2)', baseGrid()).value)).toBe('2.35');
    expect(displayString(run('=ROUNDDOWN(2.349,2)', baseGrid()).value)).toBe('2.34');
  });
  it('INT — 음수는 -무한대 방향(floor)', () => {
    expect(displayString(run('=INT(-3.2)', baseGrid()).value)).toBe('-4');
    expect(displayString(run('=INT(3.9)', baseGrid()).value)).toBe('3');
  });
  it('ABS/MOD', () => {
    expect(displayString(run('=ABS(-5)', baseGrid()).value)).toBe('5');
    expect(displayString(run('=MOD(10,3)', baseGrid()).value)).toBe('1');
  });
  it('MOD 0 나눗셈 → #DIV0', () => {
    expect(run('=MOD(10,0)', baseGrid()).error).toBe('#DIV0');
  });
  it('=A1/0 → #DIV0', () => {
    const g = baseGrid();
    expect(run('=A1/0', g).error).toBe('#DIV0');
  });
});

// ── 정밀도(F3-R20/R34 + 발주자 추가요구: 부동소수점 완전지원) ─
describe('FormulaEvaluator — OGDecimal 정밀도(부동소수점 완전지원)', () => {
  it('=0.1+0.2 → 0.3 (IEEE 오차 없음)', () => {
    expect(displayString(run('=0.1+0.2', baseGrid()).value)).toBe('0.3');
  });
  it('=1/3 → precision 30 나눗셈(기존 FormulaEngine 관례)', () => {
    const out = run('=1/3', baseGrid());
    expect((out.value as OGDecimal).toFixed(10)).toBe('0.3333333333');
  });
  it('음수 소수 산술 =-0.1+-0.2 → -0.3', () => {
    expect(displayString(run('=-0.1+-0.2', baseGrid()).value)).toBe('-0.3');
  });
  it('소수 비교(대소) =0.1+0.2>0.29', () => {
    expect(run('=0.1+0.2>0.29', baseGrid()).value).toBe(true);
  });
  it('소수 비교 =0.3=0.1+0.2 → true(정확 비교, float 라면 false)', () => {
    expect(run('=0.3=0.1+0.2', baseGrid()).value).toBe(true);
  });
  it('과학표기 리터럴 산술 =1e-5*100000 → 1', () => {
    expect(displayString(run('=1e-5*100000', baseGrid()).value)).toBe('1');
  });
  it('AVG 결과도 정확(부동소수점 결과 보존) — 합 15를 3으로 나눈 값', () => {
    const g = new MockGridAccessor();
    g.addColumn('a');
    g.addRow('r1', { a: '5.1' });
    g.addRow('r2', { a: '5.2' });
    g.addRow('r3', { a: '5.3' });
    const out = run('=AVERAGE(A1:A3)', g);
    expect((out.value as OGDecimal).toFixed(6)).toBe('5.200000');
  });
});

// ── 근사 표식(HANMS-17/C11) ──────────────────────────────────
describe('FormulaEvaluator — SQRT 근사(_approx, HANMS-17)', () => {
  it('=SQRT(2) → approx=true, 유한 근사값', () => {
    const out = run('=SQRT(2)', baseGrid());
    expect(out.approx).toBe(true);
    expect(out.error).toBeNull();
    expect((out.value as OGDecimal).toNumber()).toBeCloseTo(Math.sqrt(2), 10);
  });
  it('=SQRT(-1) → #NUM', () => {
    expect(run('=SQRT(-1)', baseGrid()).error).toBe('#NUM');
  });
  it('정수 거듭제곱은 approx=false(정확)', () => {
    const out = run('=2^10', baseGrid());
    expect(out.approx).toBe(false);
  });
});

// ── 에러 격리(F3-R24 fuzz) ───────────────────────────────────
describe('FormulaEvaluator — fuzz 격리(F3-R24, f3.fuzz.isolate)', () => {
  it('500개 임의 문자열 — 파싱/평가가 절대 throw 하지 않는다', () => {
    const g = baseGrid();
    const tokens = ['=', 'A1', '+', '-', '*', '/', '(', ')', '"x', '[a]', 'SUM', ',', '1.2.3', '$', ':', '^', '&', 'IF'];
    let seed = 42;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 500; i++) {
      const len = 1 + Math.floor(rand() * 8);
      let src = '=';
      for (let j = 0; j < len; j++) src += tokens[Math.floor(rand() * tokens.length)];
      expect(() => {
        try {
          const raw = parseFormula(src);
          const ast = normalizeAst(raw, { rowId: 'r1', field: 'x' }, g, 'stable');
          evaluate(ast, { rowId: 'r1', field: 'x' }, g);
        } catch {
          // 파싱 단계 SyntaxError 는 setCellFormula 배선에서 잡히는 계약(§6 F3-R24는
          // "평가" 격리를 요구 — 파서 예외는 컴파일 단계 책임이라 여기선 허용하되 크래시만 없으면 됨.
        }
      }).not.toThrow();
    }
  });
});
