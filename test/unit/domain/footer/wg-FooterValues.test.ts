// @vitest-environment node
// 넓은 그리드 새 그물 — FooterValues 단위 시험(테스트 설계서 §2-20 U-FTV-01·07·08·10, §17-3 U-FTV-11, 걸음 R1).
//
// 대조군 = test/unit/wg-helpers/legacy-controls.ts 의 legacyFooterValues(FooterManager.computeValues 를 T0 에서 글자 그대로 복사).
// 지킬 이음새: 결과 모양 { _field, _value, _formatted } (FormulaWiring.test.ts 가 _footerMgr.computeValues() 로 읽음).
// 지금 동작(T0 L19 NOTES): sum·avg·max·min 은 숫자로 못 읽는 글자('abc')·지수 표기('1e2')에서 SyntaxError — 결함이지만 그대로 옮긴다.
// U-FTV-02~06·09 는 설계 rev2 K4(푸터 캐시 없음)로 삭제됨.
import { describe, it, expect } from 'vitest';
import { FooterValues } from '../../../../src/core/domain/footer/FooterValues.js';
import type { FooterDef, SummaryOpFn } from '../../../../src/core/domain/footer/FooterValues.js';
import type { FooterSource, IFooterValues } from '../../../../src/core/domain/footer/ports.js';
import { legacyFooterValues } from '../../wg-helpers/legacy-controls.js';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** rows() 가 불린 수를 세는 가짜 원천. */
function source(rows: unknown[]): FooterSource & { calls: number } {
  const s = { calls: 0, rows() { s.calls++; return rows; } };
  return s;
}
/** FooterManager deps.getStrategy 와 같은 꼴 — slot 'summaryOp' 이면 사용자 함수, 아니면 기본값. */
function strategyOf(fn: SummaryOpFn | null) {
  const lookup = <F extends Function>(slot: string, fallback: F): F => (slot === 'summaryOp' && fn ? (fn as unknown as F) : fallback);
  return lookup;
}
/** 던지면 그 예외(형·메시지), 아니면 결과. */
function outcome(f: () => unknown): { ok: true; v: unknown } | { ok: false; name: string; message: string } {
  try { return { ok: true, v: f() }; } catch (e: any) { return { ok: false, name: e?.constructor?.name, message: String(e?.message) }; }
}

const ALL_DEFS: FooterDef[] = [
  { field: 'n', op: 'sum', label: '합계' },
  { field: 'n', op: 'avg', format: '#,##0.00' },
  { field: 'n', op: 'count' },
  { field: 'n', op: 'max', format: '₩#,##0' },
  { field: 'n', op: 'min', format: '0.0원' },
  { field: 'm', op: 'SUM', format: '2' },
  { field: 'm', op: 'median' },            // 모르는 op → null / ''
  { label: '라벨만', colspan: 2 },          // field·op 없음 → 결과에서 빠짐
  { field: 'n', label: '값 없는 라벨' },     // op 없음 → 빠짐
];

describe('FooterValues — U-FTV (R1)', () => {
  it('U-FTV-01 대조: 씨앗 8 × 500행(숫자·null·글자 숫자·빈 값·오류 토큰 섞음) — 옛 computeValues 사본과 같음', () => {
    const fv = new FooterValues();
    let compared = 0;
    for (const seed of SEEDS) {
      const r = mulberry32(seed);
      const pickN = () => {
        const x = r();
        if (x < 0.1) return null;
        if (x < 0.15) return undefined;
        if (x < 0.2) return '';
        if (x < 0.23) return '#REF';
        if (x < 0.3) return String(Math.round(r() * 2000 - 1000));   // 글자 숫자
        if (x < 0.4) return Math.round(r() * 100000) / 100;          // 소수
        return Math.round(r() * 20000 - 10000);                       // 정수(음수 포함)
      };
      const rows = Array.from({ length: 500 }, () => ({ n: pickN(), m: pickN() }));
      const got = fv.compute(ALL_DEFS, source(rows));
      const want = legacyFooterValues(ALL_DEFS, rows);
      expect(got).toEqual(want);
      // 이음새 모양: 필드 셋이 그대로
      for (const g of got) expect(Object.keys(g).sort()).toEqual(['_field', '_formatted', '_value']);
      compared++;
    }
    expect(compared).toBe(8);
  });

  it('U-FTV-01 대조(사용자 summaryOp 가 일부 op 만 가로챔) — 옛 사본과 같음', () => {
    const median: SummaryOpFn = (op, nums) => {
      if (op !== 'MEDIAN' && op !== 'SUM') return null;
      const s = nums.map(Number).sort((a, b) => a - b);
      return op === 'SUM' ? 42 : s.length ? s[Math.floor(s.length / 2)]! : 0;
    };
    const fv = new FooterValues({ getStrategy: strategyOf(median) });
    const r = mulberry32(11);
    const rows = Array.from({ length: 500 }, () => ({ n: Math.round(r() * 1000), m: r() < 0.2 ? null : Math.round(r() * 50) }));
    expect(fv.compute(ALL_DEFS, source(rows))).toEqual(legacyFooterValues(ALL_DEFS, rows, median));
  });

  it('U-FTV-07 빈 자료(0행) — 옛 사본과 같은 값(sum·avg·max·min null/"", count 0)', () => {
    const fv = new FooterValues();
    const got = fv.compute(ALL_DEFS, source([]));
    expect(got).toEqual(legacyFooterValues(ALL_DEFS, []));
    expect(got[0]).toEqual({ _field: 'n', _value: null, _formatted: '' });
    expect(got[2]).toEqual({ _field: 'n', _value: 0, _formatted: '0' });
    // 정의가 없거나 비면 [] 이고 원천을 읽지도 않는다(옛 코드도 getData 전에 돌아감)
    const s = source([{ n: 1 }]);
    expect(fv.compute(undefined, s)).toEqual([]);
    expect(fv.compute([], s)).toEqual([]);
    expect(s.calls).toBe(0);
  });

  it('U-FTV-08 숫자 아닌 값 — 글자 숫자 \'12\' 는 더하고 null 은 뺌, \'abc\'·\'1e2\' 는 옛 코드와 같은 자리에서 같은 예외', () => {
    const fv = new FooterValues();
    const ok = [{ n: '12' }, { n: 3 }, { n: null }, { n: '#DIV0' }];
    expect(fv.compute(ALL_DEFS, source(ok))).toEqual(legacyFooterValues(ALL_DEFS, ok));
    expect(fv.compute([{ field: 'n', op: 'sum' }], source(ok))[0]).toEqual({ _field: 'n', _value: 15, _formatted: '15' });
    // 지금 동작(결함, 이번 판은 안 고침): 숫자로 못 읽는 글자·지수 표기에서 던진다 — 새 클래스도 같은 예외
    for (const bad of [[{ n: 'abc' }, { n: '1' }], [{ n: '1e2' }], [{ n: 1e-300 }]]) {
      for (const op of ['sum', 'avg', 'max', 'min']) {
        const defs: FooterDef[] = [{ field: 'n', op }];
        const mine = outcome(() => fv.compute(defs, source(bad)));
        const old = outcome(() => legacyFooterValues(defs, bad));
        expect(mine.ok).toBe(false);
        expect(mine).toEqual(old);
        expect((mine as { name: string }).name).toBe('SyntaxError');
      }
      // count 는 값을 숫자로 읽지 않아 던지지 않음(옛 코드와 같음)
      const cdefs: FooterDef[] = [{ field: 'n', op: 'count' }];
      expect(outcome(() => fv.compute(cdefs, source(bad)))).toEqual(outcome(() => legacyFooterValues(cdefs, bad)));
    }
  });

  it('U-FTV-10 라벨만 있는 정의 {label:\'합계\', colspan:3} 는 값 칸이 안 됨(결과에서 빠짐 — 라벨은 그리는 쪽이 정의에서 그대로 읽음)', () => {
    const fv = new FooterValues();
    const defs: FooterDef[] = [{ label: '합계', colspan: 3 }, { field: 'n', op: 'sum' }];
    const got = fv.compute(defs, source([{ n: 1 }, { n: 2 }]));
    expect(got).toEqual(legacyFooterValues(defs, [{ n: 1 }, { n: 2 }]));
    expect(got).toEqual([{ _field: 'n', _value: 3, _formatted: '3' }]);
    // 정의 객체를 고치지 않는다(라벨이 그대로 남음)
    expect(defs[0]).toEqual({ label: '합계', colspan: 3 });
  });

  it('U-FTV-11 summaryOp 는 매번 부름(캐시 없음) — 같은 rows() 로 두 번 → 호출 2번, rows() 도 2번', () => {
    let calls = 0;
    const op: SummaryOpFn = () => { calls++; return 7; };
    let lookups = 0;
    const getStrategy = <F extends Function>(slot: string, fallback: F): F => { lookups++; return strategyOf(op)(slot, fallback); };
    const fv = new FooterValues({ getStrategy });
    const s = source([{ n: 1 }]);
    const defs: FooterDef[] = [{ field: 'n', op: 'sum' }];
    expect(fv.compute(defs, s)).toEqual([{ _field: 'n', _value: 7, _formatted: '7' }]);
    expect(fv.compute(defs, s)).toEqual([{ _field: 'n', _value: 7, _formatted: '7' }]);
    expect(calls).toBe(2);
    expect(lookups).toBe(2);   // 옛 코드처럼 정의마다·계산마다 전략을 다시 찾는다
    expect(s.calls).toBe(2);
  });

  // 계약 v2(2026-11-21, footer ports — values() 를 빼고 compute 하나로)에 맞춰 이 덤 시험을 고침(걸음 R3).
  it('(덤) 계약 IFooterValues.compute 로 불러도 같은 결과 — 집계 칸 정의 순서대로', () => {
    const fv: IFooterValues = new FooterValues();
    const rows = [{ n: 2 }, { n: 4 }];
    const defs: FooterDef[] = [{ field: 'n', op: 'sum' }, { label: 'x' }, { field: 'n', op: 'avg' }];
    expect(fv.compute(defs, source(rows))).toEqual([
      { _field: 'n', _value: 6, _formatted: '6' }, { _field: 'n', _value: 3, _formatted: '3' },
    ]);
  });

  it('(덤) format 은 옛 FooterManager.fmtNum 과 같은 글자', () => {
    const fv = new FooterValues();
    const cases: Array<[number, string | undefined]> = [
      [1234567.891, undefined], [-1234.5, '#,##0.00'], [0.125, '0.00'], [1234.5, '2'], [99, '₩#,##0'], [-7.25, '0.0원'], [5, 'abc'],
    ];
    for (const [v, f] of cases) {
      const viaLegacy = legacyFooterValues([{ field: 'x', op: 'sum', format: f }], [{ x: v }])[0]._formatted;
      expect(fv.format(v, f)).toBe(viaLegacy);
    }
  });
});
