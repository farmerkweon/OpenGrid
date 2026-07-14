// ============================================================
// DD-08 §2.3/§4 — 확장 함수군(tier:'extended', 지연로딩·플러그인)
// 레이어: Algorithm (헤드리스, 순수)
// 설계 SSOT: DD-08 §7(하드제약 108KB) — 확장 함수는 코어 밖 옵트인. 이 모듈은 코어 진입점에서
//   import 되지 않으며(tree-shaken), 소비자가 `registerExtendedFunctions(reg)` 로 명시 등록할
//   때만 번들·평가에 편입된다. FunctionRegistry seam(§2.3) 실증용 대표 셋.
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../../../OGDecimal.js';
import type { FunctionDef, FunctionRegistry } from '../../FunctionRegistry.js';

/** 확장 함수군(tier:'extended'). 코어 미포함 — 명시 등록 시에만 활성. / Extended set; opt-in only. */
export const EXTENDED_FUNCTIONS: readonly FunctionDef[] = [
  {
    name: 'PRODUCT', tier: 'extended', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '곱 / product', returns: 'number' },
    evaluate: (_a, ctx) => {
      const nums = ctx.collect().filter((v) => ctx.isNumeric(v));
      if (nums.length === 0) ctx.fail('#ERR');
      let acc = OGDecimal.one();
      for (const v of nums) acc = acc.mul(ctx.toNum(v));
      return acc;
    },
  },
  {
    name: 'MEDIAN', tier: 'extended', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '중앙값 / median', returns: 'number' },
    evaluate: (_a, ctx) => {
      const vals = ctx.collect().filter((v) => ctx.isNumeric(v)).map((v) => ctx.toNum(v));
      if (vals.length === 0) ctx.fail('#ERR');
      vals.sort((x, y) => (x.lt(y) ? -1 : x.gt(y) ? 1 : 0));
      const mid = Math.floor(vals.length / 2);
      if (vals.length % 2 === 1) return vals[mid];
      return vals[mid - 1].add(vals[mid]).div(OGDecimal.from('2') as OGDecimalLike, ctx.prec);
    },
  },
  {
    name: 'IFERROR', tier: 'extended', arity: { min: 2, max: 2 },
    signature: { params: [{ name: 'value' }, { name: 'fallback' }], summary: '오류 시 대체 / value or fallback on error', returns: 'any' },
    evaluate: (a, ctx) => {
      if (ctx.argCount !== 2) ctx.fail('#ERR');
      const r = a[0].tryScalar();
      return r.ok ? r.value : a[1].scalar();
    },
  },
];

/**
 * 확장 함수군을 레지스트리에 일괄 등록(지연로딩 진입점). 이미 있는 이름은 override 로 교체.
 * / Batch-register the extended function set (lazy-load entry point). Existing names are overridden.
 *
 * @param reg - 대상 함수 레지스트리 / Target function registry
 */
export function registerExtendedFunctions(reg: FunctionRegistry): void {
  for (const def of EXTENDED_FUNCTIONS) reg.register(def, { override: true });
}
