// @vitest-environment node
// 넓은 그리드 새 그물 — 걸음 C5b(푸터 계산 속도): 결과는 한 글자도 안 바뀌고 속도만.
// 대조군 = wg-helpers/legacy-controls.ts 의 legacyFooterValues(T0 에 FooterManager.computeValues 를 글자 그대로 복사).
// 걸음 전 판과의 무작위 맞대기(496경우)와 망가뜨린 판 자기시험은 steps/C5b/L30/tools/equiv.mjs·mutants.mjs(원자료 evidence/).
import { describe, it, expect, vi } from 'vitest';
import { FooterValues } from '../../../../src/core/domain/footer/FooterValues.js';
import { FORMULA_ERROR_CODES } from '../../../../src/core/formula/types.js';
import { legacyFooterValues } from '../../wg-helpers/legacy-controls.js';

const src = (rows: unknown[]) => ({ rows: () => rows });
const outcome = (f: () => unknown) => { try { return { ok: f() }; } catch (e: any) { return { err: `${e?.constructor?.name}: ${e?.message}` }; } };

describe('C5b FooterValues — 한 번 훑기 · 싼 오류 글자 검사 · 같은 컬럼 한 번', () => {
  it('C5b-01 오류 글자 경계 — 목록의 7종은 빠지고, 비슷한 글자(" #REF"·"#REFX"·"#"·"#ref"·4,000자 "#…")는 남음 = 옛 계산', () => {
    const vals = [...FORMULA_ERROR_CODES, ' #REF', '#REFX', '#', '#ref', '#' + 'x'.repeat(4000), '1', 2, '', null, undefined];
    const rows = vals.map((a) => ({ a }));
    const defs = [{ field: 'a', op: 'count' }];
    expect(new FooterValues().compute(defs, src(rows))).toEqual(legacyFooterValues(defs, rows));
    expect(new FooterValues().compute(defs, src(rows))[0]!._value).toBe(7);
  });

  it('C5b-02 긴 글자에는 오류 목록 조회를 하지 않음(로프 글자를 펼치지 않으려고) — 조회는 짧은 # 글자에만', () => {
    const spy = vi.spyOn(FORMULA_ERROR_CODES as Set<string>, 'has');
    const rows = [{ a: 'x'.repeat(200) }, { a: 'ab' + ' ' + 'cd'.repeat(100) }, { a: '#REF' }, { a: '#NOPE' }, { a: 12 }, { a: '#' + 'y'.repeat(50) }];
    new FooterValues().compute([{ field: 'a', op: 'count' }], src(rows));
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['#REF', '#NOPE']);
    spy.mockRestore();
  });

  it('C5b-03 같은 컬럼 정의 여럿 — 값 같음 · 사용자 summaryOp 가 받는 배열은 정의마다 따로(고쳐도 다른 정의에 안 번짐)·차례·횟수 = 옛 계산', () => {
    const rows = [{ a: 1 }, { a: '2' }, { a: null }, { a: '#DIV0' }, { a: 4 }];
    const defs = [{ field: 'a', op: 'sum' }, { field: 'a', op: 'avg' }, { field: 'a', op: 'count' }, { field: 'b', op: 'count' }];
    const mkOp = (log: any[]) => (op: string, nums: any[], field: string) => { log.push([op, field, [...nums]]); nums.push(1000); return null; };
    const newLog: any[] = [], oldLog: any[] = [];
    const op1 = mkOp(newLog);
    const got = new FooterValues({ getStrategy: <F extends Function>(slot: string, fb: F): F => (slot === 'summaryOp' ? (op1 as unknown as F) : fb) }).compute(defs, src(rows));
    const want = legacyFooterValues(defs, rows, mkOp(oldLog));
    expect(got).toEqual(want);
    expect(newLog).toEqual(oldLog);
  });

  it('C5b-04 같은 예외 — 숫자로 못 읽는 글자 합(SyntaxError, 알려진 결함 그대로) · null 행(TypeError, 첫 정의의 필드 이름)', () => {
    const defsA = [{ field: 'a', op: 'count' }, { field: 'a', op: 'sum' }];
    const rowsA = [{ a: 'abc' }, { a: 1 }];
    expect(outcome(() => new FooterValues().compute(defsA, src(rowsA)))).toEqual(outcome(() => legacyFooterValues(defsA, rowsA)));
    expect(outcome(() => new FooterValues().compute(defsA, src(rowsA)))).toHaveProperty('err');
    const defsB = [{ field: 'b', op: 'count' }, { field: 'a', op: 'sum' }];
    const rowsB = [{ a: 1, b: 1 }, null, { a: 2, b: 2 }];
    const n = outcome(() => new FooterValues().compute(defsB, src(rowsB)));
    expect(n).toEqual(outcome(() => legacyFooterValues(defsB, rowsB as any[])));
    expect((n as any).err).toContain("'b'");
  });

  it('C5b-05 계산 사이에 아무것도 들고 있지 않음 — 같은 행 객체 값을 바꾸면 다음 계산에 바로 반영(캐시 없음)', () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const fv = new FooterValues();
    expect(fv.compute([{ field: 'a', op: 'sum' }], src(rows))[0]!._value).toBe(3);
    rows[0]!.a = 10;
    expect(fv.compute([{ field: 'a', op: 'sum' }], src(rows))[0]!._value).toBe(12);
  });
});
