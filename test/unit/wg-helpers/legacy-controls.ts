/**
 * 대조군(옛 동작) 사본 — 테스트 설계서 TEST_DESIGN_NEW.md §0-4. L19(T0) 소유.
 *
 * 복사한 날: 2026-11-21 (걸음 T0, src 무수정 상태). 원본이 뒤 걸음에서 바뀌어도 이 사본은 **고치지 않는다**
 * (그래야 대조군이다). 각 사본이 지금 코드와 같은 값을 내는지는 test/unit/wg-controls-legacy.test.ts ·
 * wg-sort-oracle.test.ts 가 T0 에서 한 번 단언한다.
 *
 * 복사 원본:
 *  - legacySortCompare / legacySortIndexes : src/core/DataLayer.ts:502~550 (applySort — 기본 비교 :526~533, 여러 키 고리 :536~545,
 *    출발 = _displayIndexes 에서 삭제 행을 뺀 것 :507~522)
 *  - legacyExtraWidth(..., detail)          : src/core/GridRenderer.ts:288~294(renderHeader _extraW) · :578~583(renderBody _ew) ·
 *                                             :410~414(머리글 고정 leftOff) · :896~901(본문 고정 frozenLeftOff) · :1129~1133(세로 병합 leftOff)
 *                                             — 다섯 자리 모두 디테일 컬럼 28 을 더함. 여분 컬럼 머리글 :307~324 · 본문 extraBodyLeft 는 누적형.
 *  - legacyExtraWidthWithoutDetail          : src/core/RenderController.ts:107~127(recalcWidths) · src/core/FooterManager.ts:181~185(render)
 *                                             — 디테일 28 을 **안** 더함(결함 H-4 — 걸음 C15 에서 고쳐짐. 대조군은 옛 그대로 두고 기록용 — CTL-EXT-02·03 은 이제 legacyExtraWidth 와 맞댐)
 *  - legacyFrozenLeft                       : 위 고정 left 자리(머리글·본문·병합) 공통식
 *  - legacyTotalColWidth                    : GridRenderer.ts:294 · :584 (머리글 표 width · 본문 min-width)
 *  - legacyRecalcWidthsInput                : RenderController.ts:110~116 (computeWidths 에 넘기는 폭)
 *  - legacyFooterValues                     : src/core/FooterManager.ts computeValues (집계 규칙 · summaryOp 슬롯)
 *  - legacyViewportHeight                   : src/core/RenderController.ts:157~187 (syncHeaderLayout 클램프)
 */
import { OGDecimal } from '../../../src/core/OGDecimal.js';
import { isErrorToken } from '../../../src/core/formula/types.js';

// ─── 정렬 ───────────────────────────────────────────────────────
/** DataLayer.applySort 의 기본 단일 키 비교(글자 그대로). */
export function legacySortCompare(a: any, b: any, _field?: string, _dir?: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export type LegacySortItem = { field: string; dir: 'asc' | 'desc' };

/**
 * applySort 를 그대로 흉내 낸 대조 정렬.
 * @param rows   원본 자료(_data 순서)
 * @param start  직전 표시 순서(_displayIndexes) — 원본 색인 배열
 * @param sortList 정렬 키
 * @param isRemoved 원본 색인 → 삭제 상태인가
 * @param cmp    단일 키 비교(기본 = legacySortCompare). 자기시험이 일부러 틀린 비교자를 넣는다.
 * @returns 새 표시 순서(원본 색인 배열)
 */
export function legacySortIndexes(
  rows: any[], start: number[], sortList: LegacySortItem[],
  isRemoved: (i: number) => boolean = () => false,
  cmp: (a: any, b: any, field: string, dir: 'asc' | 'desc') => number = legacySortCompare,
): number[] {
  const notRemoved = (i: number) => !isRemoved(i);
  if (sortList.length === 0) return rows.map((_, i) => i).filter(notRemoved);
  const keyed = start.filter(notRemoved).map(idx => {
    const row = rows[idx]!;
    return { idx, keys: sortList.map(s => row[s.field]) };
  });
  keyed.sort((a, b) => {
    for (let si = 0; si < sortList.length; si++) {
      const dir = sortList[si]!.dir;
      const field = sortList[si]!.field;
      const av = a.keys[si];
      const bv = b.keys[si];
      const c = cmp(av, bv, field, dir);
      if (c !== 0) return dir === 'asc' ? c : -c;
    }
    return 0;
  });
  return keyed.map(k => k.idx);
}

// ─── 여분 컬럼 폭 · 고정 left · 전체 폭 ─────────────────────────────
export interface LegacyExtraOpts {
  stateColumn?: boolean; draggable?: boolean; rowNumber?: boolean; checkColumn?: boolean;
  defaultColumnWidth?: number;
}
export const LEGACY_DETAIL_COL_W = 28;

/** GridRenderer 다섯 자리 공통 — 여분 컬럼 폭 합(디테일 컬럼 포함). */
export function legacyExtraWidth(opts: LegacyExtraOpts, detailColOn: boolean): number {
  let w = 0;
  if (opts.stateColumn) w += 24;
  if (opts.draggable)   w += 18;
  if (opts.rowNumber)   w += 44;
  if (opts.checkColumn) w += 36;
  if (detailColOn)      w += LEGACY_DETAIL_COL_W;
  return w;
}

/** 걸음 전 RenderController.recalcWidths · FooterManager.render — 디테일 컬럼을 빼먹은 합(H-4, C15 에서 고쳐짐 — 옛 값 기록용). */
export function legacyExtraWidthWithoutDetail(opts: LegacyExtraOpts): number {
  let w = 0;
  if (opts.stateColumn) w += 24;
  if (opts.draggable)   w += 18;
  if (opts.rowNumber)   w += 44;
  if (opts.checkColumn) w += 36;
  return w;
}

/** 고정 컬럼 i 의 sticky left(머리글·본문·세로 병합 마스터 공통식). */
export function legacyFrozenLeft(widths: number[], opts: LegacyExtraOpts, detailColOn: boolean, i: number): number {
  let left = legacyExtraWidth(opts, detailColOn);
  for (let k = 0; k < i; k++) left += widths[k] ?? (opts.defaultColumnWidth as number);
  return left;
}

/** 머리글 표 width · 본문 min-width. */
export function legacyTotalColWidth(widths: number[], leafCount: number, opts: LegacyExtraOpts, detailColOn: boolean): number {
  let s = legacyExtraWidth(opts, detailColOn);
  for (let i = 0; i < leafCount; i++) s += widths[i] ?? (opts.defaultColumnWidth as number);
  return s;
}

/** recalcWidths 가 computeWidths 에 넘기는 폭. */
export function legacyRecalcWidthsInput(totalWidth: number, opts: LegacyExtraOpts): number {
  return totalWidth
    - (opts.stateColumn ? 24 : 0)
    - (opts.draggable   ? 18 : 0)
    - (opts.rowNumber   ? 44 : 0)
    - (opts.checkColumn ? 36 : 0);
}

// ─── 푸터 값 ────────────────────────────────────────────────────
function legacyFmtNum(value: number, fmt?: string): string {
  if (!fmt) return Math.round(value).toLocaleString('ko-KR');
  const tok = fmt.match(/[#0][#0,]*(?:\.[#0]+)?|\d+/);
  const prefix  = tok ? fmt.slice(0, tok.index) : '';
  const suffix  = tok ? fmt.slice(tok.index! + tok[0].length) : '';
  const numFmt  = tok ? tok[0] : fmt;
  const useComma = numFmt.includes('#') || numFmt.includes(',');
  const dpMatch  = numFmt.match(/\.(\d+)$/);
  const dp = dpMatch ? parseInt(dpMatch[1]!, 10) : /^\d+$/.test(numFmt) ? parseInt(numFmt, 10) : 0;
  const fixed = Math.abs(value).toFixed(dp);
  const [intPart = '0', decPart] = fixed.split('.');
  const intStr = useComma ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart;
  const body = decPart !== undefined ? `${intStr}.${decPart}` : intStr;
  const result = `${prefix}${body}${suffix}`;
  return value < 0 ? `-${result}` : result;
}

/** FooterManager.computeValues 사본. allData = 그리드의 getData()(표시 순서·필터 반영 행). */
export function legacyFooterValues(
  footerDefs: any[] | undefined, allData: any[],
  customOp: ((op: string, nums: any[], field: string) => number | null) | null = null,
): any[] {
  if (!footerDefs || footerDefs.length === 0) return [];
  return footerDefs
    .filter((d: any) => d.field && d.op)
    .map((def: any) => {
      const field = def.field!;
      const op = def.op!;
      const nums = allData.map((r: any) => r[field])
        .filter((v: any) => v !== null && v !== undefined && v !== '' && !isErrorToken(v));
      let result: OGDecimal | null = null;
      const opUC = (op as string).toUpperCase();
      if (customOp) {
        const cv = customOp(opUC, nums, field);
        if (cv != null) return { _field: field, _value: cv, _formatted: legacyFmtNum(cv, def.format) };
      }
      if (opUC === 'SUM') {
        result = nums.length > 0 ? OGDecimal.sum(nums.map((v: any) => String(v))) : null;
      } else if (opUC === 'AVG') {
        result = nums.length > 0
          ? OGDecimal.sum(nums.map((v: any) => String(v))).div(OGDecimal.from(String(nums.length)))
          : null;
      } else if (opUC === 'COUNT') {
        const cnt = nums.length;
        return { _field: field, _value: cnt, _formatted: cnt.toLocaleString('ko-KR') };
      } else if (opUC === 'MAX') {
        result = nums.length > 0 ? OGDecimal.max(nums.map((v: any) => String(v))) : null;
      } else if (opUC === 'MIN') {
        result = nums.length > 0 ? OGDecimal.min(nums.map((v: any) => String(v))) : null;
      }
      if (!result) return { _field: field, _value: null, _formatted: '' };
      const numVal = result.toNumber();
      return { _field: field, _value: numVal, _formatted: legacyFmtNum(numVal, def.format) };
    });
}

// ─── 높이 판정 ──────────────────────────────────────────────────
/**
 * RenderController.syncHeaderLayout 의 높이 식 사본.
 * @returns null = 컨테이너 높이 0 이라 아무것도 안 함(원본의 early return) / 그 밖 = { bodyWrapHeight, viewportHeight }
 */
export function legacyViewportHeight(p: {
  containerHeight: number; measuredHeaderHeight: number; headerHeight: number; pagination: boolean;
  fallbackViewportHeight?: number; totalContentHeight: number;
}): { bodyWrapHeight: number; viewportHeight: number } | null {
  if (!p.containerHeight) return null;
  const pag = p.pagination ? 38 : 0;
  const headerH = p.measuredHeaderHeight > p.headerHeight ? p.measuredHeaderHeight : p.headerHeight;
  const bodyWrapHeight = (p.containerHeight - pag) - headerH;
  let vpHeight = p.containerHeight - headerH - pag;
  const fallback = p.fallbackViewportHeight;
  if (fallback && fallback > 0) {
    if (vpHeight >= p.totalContentHeight && vpHeight > fallback) vpHeight = fallback;
  }
  return { bodyWrapHeight, viewportHeight: vpHeight };
}
