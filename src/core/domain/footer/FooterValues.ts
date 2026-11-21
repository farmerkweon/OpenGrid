// ============================================================
// 푸터 합계 값 계산(헤드리스) / Footer summary values (headless)
// 푸터 정의마다 합계·평균·개수·최대·최소를 셈한다. 계산만 하고 화면은 모른다 — 그리는 쪽은 결과만 받는다.
// 값은 지금까지의 푸터 계산과 한 글자도 다르지 않다: 빈 값·null·수식 오류 칸은 빼고, 글자 숫자는 숫자로 읽고,
// 사용자 집계 전략(summaryOp)이 숫자를 돌려주면 그 값을 쓴다. 숫자로 못 읽는 글자는 지금처럼 예외가 난다.
// 캐시를 두지 않는다. 다시 셈하는 때를 줄이는 일은 「무엇이 바뀌었나」를 아는 그리기 계획 쪽이 맡는다
// (자료가 바뀌었는지 아는 주인을 하나 더 만들지 않으려고). 사용자 전략도 그래서 부를 때마다 다시 찾고 다시 부른다.
//
// Computes sum/avg/count/max/min per footer definition. Pure computation, no rendering.
// Values are identical to the previous footer computation: empty, null and formula-error cells are
// skipped, numeric strings are read as numbers, a user `summaryOp` result wins, and unreadable text
// still throws as before. No cache: the render plan decides when to recompute, so the user strategy
// is looked up and called on every computation.
// ============================================================
import { OGDecimal } from '../../OGDecimal.js';
import { FORMULA_ERROR_CODES } from '../../formula/types.js';
import type { FooterDefLike, FooterResultLike, FooterSource, FooterValue, IFooterValues } from './ports.js';

/** 푸터 정의 한 줄(옵션 `footer` 의 원소 꼴 — 계약 꼴에 그리는 쪽이 읽는 맞춤을 더함). / One footer definition. */
export interface FooterDef extends FooterDefLike {
  readonly align?: string;
}

/** 정의 하나의 계산 결과. 필드 이름은 공개 `getFooterData()` 가 돌려주는 모양 그대로. / Result shape exposed by `getFooterData()`. */
export interface FooterResult extends FooterResultLike {
  _field: string;
  _value: FooterValue;
  _formatted: string;
}

/** 사용자 집계 전략: 숫자를 돌려주면 그 값, null 이면 기본 집계. / User aggregate: a number wins, null falls back. */
export type SummaryOpFn = (op: string, nums: any[], field: string) => number | null;

/** 확장 지점 조회(그리드의 전략 조회와 같은 꼴). / Strategy lookup, same shape as the grid's. */
export type StrategyLookup = <F extends Function>(slot: string, fallback: F) => F;

export interface FooterValuesOptions {
  /** `summaryOp` 슬롯을 찾는 곳. 없으면 사용자 전략 없음. / Where the `summaryOp` slot is resolved. */
  getStrategy?: StrategyLookup;
}

/** 기본 집계 하나. 결과가 null 이면 「값 없음」(빈 칸). / One built-in aggregate; null means no value. */
type Aggregate = (nums: any[]) => OGDecimal | null;

const asStrings = (nums: any[]): string[] => nums.map((v: any) => String(v));

/**
 * 기본 집계 표(대문자 op → 집계). 개수(COUNT)는 숫자 꼴이 달라(로캘 구분 기호, 서식 무시) 따로 다룬다.
 * 표에 없는 op 는 값 없음이다. 객체 대신 Map 이라 'CONSTRUCTOR' 같은 이름이 원형을 건드리지 않는다.
 *
 * Built-in aggregates keyed by upper-case op. COUNT is formatted differently and handled apart.
 * Unknown ops yield no value. A Map keeps names like 'CONSTRUCTOR' away from the prototype.
 */
const AGGREGATES: ReadonlyMap<string, Aggregate> = new Map<string, Aggregate>([
  ['SUM', (nums) => (nums.length > 0 ? OGDecimal.sum(asStrings(nums)) : null)],
  ['AVG', (nums) => (nums.length > 0
    ? OGDecimal.sum(asStrings(nums)).div(OGDecimal.from(String(nums.length)))
    : null)],
  ['MAX', (nums) => (nums.length > 0 ? OGDecimal.max(asStrings(nums)) : null)],
  ['MIN', (nums) => (nums.length > 0 ? OGDecimal.min(asStrings(nums)) : null)],
]);

const NO_STRATEGY: StrategyLookup = (_slot, fallback) => fallback;

// 수식 오류 글자(#REF 등)인지 싸게 거르는 앞검사 — 오류 글자 목록에서 한 번 뽑아 둔다(목록이 바뀌어도 그대로 맞게).
// 긴 글자는 길이만 보고 바로 지나간다: Set 조회는 글자를 해시해야 하고, 이어 붙인 글자(로프)는 그때 통째로 펼쳐져
// 10만 행 × 컬럼 수만큼 비싸다. 판정 결과는 「목록에 있나」와 같다(목록의 글자는 모두 이 길이 안·이 첫 글자 중 하나).
// Cheap pre-check for formula error tokens, derived once from the token list: long strings skip the Set lookup (which
// would hash and flatten rope strings for every row). Same verdict as membership in the list.
let ERR_MAX_LEN = 0;
const ERR_FIRST = new Set<number>();
for (const t of FORMULA_ERROR_CODES) {
  if (t.length > ERR_MAX_LEN) ERR_MAX_LEN = t.length;
  ERR_FIRST.add(t.charCodeAt(0));
}
const isErrorCell = (v: unknown): boolean =>
  typeof v === 'string' && v.length <= ERR_MAX_LEN && ERR_FIRST.has(v.charCodeAt(0)) && FORMULA_ERROR_CODES.has(v);

/**
 * 한 컬럼을 한 번 훑어 집계 대상 값(빈 값·null·undefined·수식 오류 글자를 뺀 것)을 행 순서대로 모은다.
 * 중간 배열을 두 번 만들지 않는다.
 * / One pass over a column collecting aggregatable values in row order, without intermediate arrays.
 */
function collect(rows: readonly unknown[], field: string): any[] {
  const out: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = (rows[i] as any)[field];
    if (v === null || v === undefined || v === '' || isErrorCell(v)) continue;
    out.push(v);
  }
  return out;
}

/**
 * 푸터 합계 값 계산의 유일한 주인. 상태가 없고 캐시도 없다 — 같은 입력이면 같은 결과, 부를 때마다 다시 셈한다.
 *
 * Sole owner of footer summary values. Stateless and uncached.
 */
export class FooterValues implements IFooterValues {
  private readonly _strategy: StrategyLookup;

  constructor(opts?: FooterValuesOptions) {
    this._strategy = opts?.getStrategy ?? NO_STRATEGY;
  }

  /**
   * 정의마다 결과 하나(field 와 op 가 둘 다 있는 정의만, 정의 순서대로). 정의가 없으면 원천을 읽지 않고 [].
   * 원천은 계산 한 번에 한 번 읽는다.
   *
   * One result per definition that has both field and op, in order. Reads the source once.
   */
  compute(defs: readonly FooterDefLike[] | null | undefined, src: FooterSource): FooterResult[] {
    if (!defs || defs.length === 0) return [];
    const rows = src.rows();
    const active = defs.filter((d) => d.field && d.op);
    // 같은 컬럼을 보는 정의가 여럿이면 그 컬럼은 한 번만 훑는다(이 계산 안에서만 — 계산 사이에는 아무것도 들고 있지 않음).
    // 정의마다 받는 값 배열은 따로다(사용자 전략이 배열을 고쳐도 다른 정의에 번지지 않게 — 지금 동작과 같다).
    // Columns read by several definitions are scanned once per compute; each definition still gets its own array.
    const uses = new Map<string, number>();
    for (const d of active) uses.set(d.field!, (uses.get(d.field!) ?? 0) + 1);
    const scanned = new Map<string, any[]>();
    const valuesOf = (field: string): any[] => {
      let base = scanned.get(field);
      if (!base) { base = collect(rows, field); scanned.set(field, base); }
      return uses.get(field)! > 1 ? base.slice() : base;
    };
    return active.map((def) => this._computeOne(def, valuesOf));
  }

  /**
   * 숫자를 표시 글자로. 서식이 없으면 반올림 후 한국 로캘 구분 기호. 서식이 있으면 숫자 토큰 앞뒤의 접두·접미
   * (통화 기호 등)를 떼고, `#`·`,` 가 있으면 천 단위 구분 기호, 소수부 자릿수로 반올림 자리를 정한다.
   *
   * Formats a number for display. No format: rounded, ko-KR separators. With a format: prefix/suffix
   * around the numeric token are kept, `#`/`,` turn on thousands separators, decimals set precision.
   */
  format(value: number, fmt?: string): string {
    if (!fmt) {
      return Math.round(value).toLocaleString('ko-KR');
    }
    const tok = fmt.match(/[#0][#0,]*(?:\.[#0]+)?|\d+/);
    const prefix  = tok ? fmt.slice(0, tok.index) : '';
    const suffix  = tok ? fmt.slice(tok.index! + tok[0].length) : '';
    const numFmt  = tok ? tok[0] : fmt;

    const useComma = numFmt.includes('#') || numFmt.includes(',');
    const dpMatch  = numFmt.match(/\.(\d+)$/);
    const dp = dpMatch
      ? parseInt(dpMatch[1]!, 10)
      : /^\d+$/.test(numFmt) ? parseInt(numFmt, 10) : 0;

    const fixed = Math.abs(value).toFixed(dp);
    const [intPart = '0', decPart] = fixed.split('.');
    const intStr = useComma
      ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : intPart;

    const body = decPart !== undefined ? `${intStr}.${decPart}` : intStr;
    const result = `${prefix}${body}${suffix}`;
    return value < 0 ? `-${result}` : result;
  }

  /**
   * 정의 하나. 순서를 지금 계산과 같게 둔다: 값 모으기 → 사용자 전략 찾기·부르기 → 개수 → 기본 집계.
   * 순서가 같아야 예외가 나는 자리와 사용자 전략이 받는 값이 같다.
   *
   * One definition, in the same order as before so exceptions and strategy inputs match.
   */
  private _computeOne(def: FooterDefLike, valuesOf: (field: string) => any[]): FooterResult {
    const field = def.field!;
    const op = def.op!;
    // 빈 값·null·수식 오류 칸은 집계에서 뺀다(0 으로 치면 합계가 오염됨).
    const nums = valuesOf(field);
    const opUC = (op as string).toUpperCase();

    const customOp = this._strategy('summaryOp', null as unknown as SummaryOpFn);
    if (customOp) {
      const cv = customOp(opUC, nums, field);
      if (cv != null) {
        return { _field: field, _value: cv, _formatted: this.format(cv, def.format) };
      }
    }

    if (opUC === 'COUNT') {
      const cnt = nums.length;
      return { _field: field, _value: cnt, _formatted: cnt.toLocaleString('ko-KR') };
    }

    const aggregate = AGGREGATES.get(opUC);
    const result = aggregate ? aggregate(nums) : null;
    if (!result) return { _field: field, _value: null, _formatted: '' };

    const numVal = result.toNumber();
    return { _field: field, _value: numVal, _formatted: this.format(numVal, def.format) };
  }
}
