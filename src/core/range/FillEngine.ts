/**
 * FillEngine — F1 채우기 핸들/Ctrl+D/R의 순수 플랜 생성 (헤드리스, 실행은 배선 단계 writeCells/setCellFormula가 수행).
 * 계약 근거: 11_design_F1_v2.md §3.4(핸들)/§3.4.1(copy vs series 감지)/§3.5(배치 커밋 경로)/§3.6(수식 합동, C3).
 *
 * 이 모듈은 어떤 값도 직접 쓰지 않는다. `buildFillPlan`은 셀별 계획 항목
 * { rowIndex(flat), field, action: 'value'|'setFormula'|'skip', value?, formula?, reason? } 배열만 반환하고,
 * 실제 grid.beginBatch()/writeCells()/setCellFormula()/endBatch() 호출은 후속 배선 태스크의 책임이다(C2.1).
 *
 * 수식 합동(C3) 해석 노트: 소스 라인이 detectSeries로 'arith'|'text-suffix'로 판정되면 그 결과값은
 * "계산된 시리즈 값"이므로 원본 셀의 수식 여부와 무관하게 값으로 기록한다(§3.6은 "소스가 수식"을
 * 리터럴 복제(=copy) 경로에 대한 규칙으로 읽는다 — 시리즈 외삽은 새 값을 만들어내는 연산이라 별개).
 * 'copy'로 판정된 라인(또는 mode==='copy' 지정)만 소스별 수식 유무를 검사해 C3 규칙 1/2/3을 적용한다.
 */
import { OGDecimal } from '../OGDecimal.js';
import type { CellRange, FillAxis, FillMode, FlatRowRefLike } from './types.js';

// ── copy vs 선형시리즈 감지(§3.4.1, FR-3) ───────────────────

export interface DetectSeriesResult {
  kind: 'copy' | 'arith' | 'text-suffix';
  /** 자연순서(위→아래 / 왼→오) diff. arith/text-suffix에만 존재 */
  step?: OGDecimal;
  /** 자연순서로 파싱된 수치값(arith) 또는 접미 숫자부(text-suffix) */
  values?: OGDecimal[];
  /** text-suffix의 공통 접두문자열 */
  prefix?: string;
}

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
const TEXT_SUFFIX_RE = /^(.*?)(\d+)$/;

function tryParseDecimal(v: any): OGDecimal | null {
  const s = String(v ?? '').trim();
  if (s === '' || !NUMERIC_RE.test(s)) return null;
  try {
    return OGDecimal.from(s);
  } catch {
    return null;
  }
}

/**
 * 소스 라인(주축과 직교하는 한 행 또는 한 열의 값 배열, 자연순서=위→아래/왼→오) → 감지 결과.
 * 경계 AC(REQ-24): [1,2,4]→copy, [5]→copy, ["a","b"]→copy, ["Q1","Q2"]→arith 아님 text-suffix(step=1).
 */
export function detectSeries(sourceLine: any[]): DetectSeriesResult {
  const len = sourceLine.length;
  if (len === 0) return { kind: 'copy' };

  // 1) 순수 숫자
  const nums = sourceLine.map(tryParseDecimal);
  if (nums.every((n): n is OGDecimal => n !== null)) {
    if (len === 1) return { kind: 'copy' }; // ★경계: 단일 숫자 복제
    const values = nums as OGDecimal[];
    const diffs = values.slice(1).map((n, i) => n.sub(values[i]!));
    const uniform = diffs.every(d => d.eq(diffs[0]!));
    if (uniform) return { kind: 'arith', step: diffs[0], values };
    return { kind: 'copy' }; // ★경계: 비등차 → copy
  }

  // 2) 텍스트+말미숫자
  if (len >= 2) {
    const matches = sourceLine.map(v => TEXT_SUFFIX_RE.exec(String(v ?? '')));
    if (matches.every((m): m is RegExpExecArray => m !== null)) {
      const prefixes = matches.map(m => m[1]!);
      const samePrefix = prefixes.every(p => p === prefixes[0]);
      if (samePrefix) {
        const suffixNums = matches.map(m => OGDecimal.from(m[2]!));
        const diffs = suffixNums.slice(1).map((n, i) => n.sub(suffixNums[i]!));
        const uniform = diffs.every(d => d.eq(diffs[0]!));
        if (uniform) {
          return { kind: 'text-suffix', step: diffs[0], values: suffixNums, prefix: prefixes[0] };
        }
      }
    }
  }

  // 3) 그 외 → copy (★경계: prefix 상이/숫자부 비등차 포함)
  return { kind: 'copy' };
}

/** copy 타일 반복 인덱스. 방향에 따라 "소스에서 가장 가까운 셀"이 자연순서의 다른 끝이 되므로 대칭 공식 사용. */
function copyTileIndex(axis: FillAxis, d: number, len: number): number {
  if (len <= 0) return 0;
  const forward = axis === 'down' || axis === 'right';
  return forward ? (d - 1) % len : (len - (d % len)) % len;
}

/**
 * 감지 결과 + 자연순서 소스라인으로 target 거리 d(1..N, 소스에 가장 가까운 셀=1)의 값을 외삽.
 * 방향 부호(§3.4.1 "위/왼쪽 채우면 step 부호 반전")는 axis에 따라 base/부호를 선택해 처리한다.
 */
export function extrapolateValue(result: DetectSeriesResult, sourceLine: any[], axis: FillAxis, d: number): any {
  const len = sourceLine.length;
  if (result.kind === 'copy' || !result.values || !result.step) {
    return sourceLine[copyTileIndex(axis, d, len)];
  }
  const forward = axis === 'down' || axis === 'right';
  const base = forward ? result.values[result.values.length - 1]! : result.values[0]!;
  const signedStep = forward ? result.step : result.step.neg();
  const extra = base.add(signedStep.mul(d));
  if (result.kind === 'text-suffix') return `${result.prefix}${extra.toNumber()}`;
  return extra.toNumber();
}

// ── 배치 플랜(§3.5/§3.6) ─────────────────────────────────────

export interface FillPlanItem {
  rowIndex: number; // flat ri
  field: string;
  action: 'value' | 'setFormula' | 'skip';
  value?: any;
  formula?: string;
  reason?: string;
}

export interface FillPlanResult {
  items: FillPlanItem[];
  /** C3.2 보존된 수식 셀 수(announce용) */
  skippedFormula: number;
}

export interface FillPlanContext {
  resolveFlatRow(ri: number): FlatRowRefLike;
  fieldAt(ci: number): string | undefined;
  getCellValue(ri: number, field: string): any;
  /** 기본 true(잠금 없음) */
  isEditable?(rowId: string, field: string): boolean;
  /** 기본 false(수식 없음) */
  hasCellFormula?(rowId: string, field: string): boolean;
  /** C3.1: 상대 ref 오프셋 수식 생성(F3 제공) */
  offsetFormula?(rowId: string, field: string, dRow: number, dCol: number): string;
  /** rangeSelection.fillOverwriteFormula(C3.2 opt-in) */
  overwriteFormula?: boolean;
  /** Ctrl-강제-copy: 수식 원문 복제(오프셋 없음) */
  forceCopyFormula?: boolean;
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function planValueOrSkip(
  ctx: FillPlanContext,
  ri: number,
  field: string,
  value: any,
  onSkipFormula: () => void,
): FillPlanItem {
  const ref = ctx.resolveFlatRow(ri);
  if (ref.kind !== 'data' || !ref.rowId) {
    return { rowIndex: ri, field, action: 'skip', reason: 'non-data-row' };
  }
  if (ctx.isEditable && !ctx.isEditable(ref.rowId, field)) {
    return { rowIndex: ri, field, action: 'skip', reason: 'not-editable' };
  }
  const targetHasFormula = !!ctx.hasCellFormula?.(ref.rowId, field);
  if (targetHasFormula && !ctx.overwriteFormula) {
    onSkipFormula();
    return { rowIndex: ri, field, action: 'skip', reason: 'formula-preserved' };
  }
  return { rowIndex: ri, field, action: 'value', value };
}

function planCopyCell(
  ctx: FillPlanContext,
  tRi: number,
  tCi: number,
  tField: string,
  sRi: number,
  sCi: number,
  sField: string,
  onSkipFormula: () => void,
): FillPlanItem {
  const ref = ctx.resolveFlatRow(tRi);
  if (ref.kind !== 'data' || !ref.rowId) {
    return { rowIndex: tRi, field: tField, action: 'skip', reason: 'non-data-row' };
  }
  if (ctx.isEditable && !ctx.isEditable(ref.rowId, tField)) {
    return { rowIndex: tRi, field: tField, action: 'skip', reason: 'not-editable' };
  }

  const srcRef = ctx.resolveFlatRow(sRi);
  const srcHasFormula = !!(srcRef.rowId && ctx.hasCellFormula?.(srcRef.rowId, sField));

  if (srcHasFormula && srcRef.rowId) {
    // C3.1
    if (ctx.forceCopyFormula) {
      const rawFormula = ctx.getCellValue(sRi, sField);
      return { rowIndex: tRi, field: tField, action: 'setFormula', formula: String(rawFormula) };
    }
    if (ctx.offsetFormula) {
      const formula = ctx.offsetFormula(srcRef.rowId, sField, tRi - sRi, tCi - sCi);
      return { rowIndex: tRi, field: tField, action: 'setFormula', formula };
    }
  }

  // C3.2: 소스=값, 대상=수식 → 기본 skip+announce
  const targetHasFormula = !!ctx.hasCellFormula?.(ref.rowId, tField);
  if (!srcHasFormula && targetHasFormula && !ctx.overwriteFormula) {
    onSkipFormula();
    return { rowIndex: tRi, field: tField, action: 'skip', reason: 'formula-preserved' };
  }

  // C3.3: 소스·대상 모두 값(또는 overwriteFormula 지정) → 값 배치
  const value = ctx.getCellValue(sRi, sField);
  return { rowIndex: tRi, field: tField, action: 'value', value };
}

/**
 * 소스 rect → 타깃 rect 채우기 플랜(§3.5). 주축과 직교하는 각 라인(행 또는 열) 별로 독립 처리(§3.4.1).
 * non-data 행(kind!=='data')은 항상 skip(C0.3/CON-5). mode==='series'가 detectSeries로 'copy'에
 * 귀결되면(경계 케이스) 그대로 copy 타일 반복으로 처리된다(설계가 의도한 동작).
 */
export function buildFillPlan(
  source: CellRange,
  target: CellRange,
  axis: FillAxis,
  mode: FillMode,
  ctx: FillPlanContext,
): FillPlanResult {
  const vertical = axis === 'up' || axis === 'down';
  const items: FillPlanItem[] = [];
  let skippedFormula = 0;
  const onSkip = () => {
    skippedFormula++;
  };

  const fixedIndexes = vertical ? range(source.startCol, source.endCol) : range(source.startRow, source.endRow);

  for (const fixed of fixedIndexes) {
    const field = vertical ? ctx.fieldAt(fixed) : undefined;

    const srcCells = vertical
      ? range(source.startRow, source.endRow).map(ri => ({ ri, ci: fixed }))
      : range(source.startCol, source.endCol).map(ci => ({ ri: fixed, ci }));

    const srcLine = srcCells.map(c => {
      const f = vertical ? field : ctx.fieldAt(c.ci);
      return f ? ctx.getCellValue(c.ri, f) : undefined;
    });

    const detected = mode === 'series' ? detectSeries(srcLine) : ({ kind: 'copy' } as DetectSeriesResult);

    const rawTargetIdx = vertical
      ? range(target.startRow, target.endRow)
      : range(target.startCol, target.endCol);
    // d=1이 소스에 가장 가까운 셀이 되도록 방향에 따라 순서 정렬
    const targetIdx = axis === 'down' || axis === 'right' ? rawTargetIdx : [...rawTargetIdx].reverse();

    targetIdx.forEach((tIdx, i) => {
      const d = i + 1;
      const tRi = vertical ? tIdx : fixed;
      const tCi = vertical ? fixed : tIdx;
      const tField = vertical ? field : ctx.fieldAt(tIdx);
      if (!tField) return;

      if (detected.kind !== 'copy') {
        const value = extrapolateValue(detected, srcLine, axis, d);
        items.push(planValueOrSkip(ctx, tRi, tField, value, onSkip));
        return;
      }

      const srcIdx = copyTileIndex(axis, d, srcCells.length);
      const srcCell = srcCells[srcIdx]!;
      const sField = vertical ? field! : ctx.fieldAt(srcCell.ci);
      if (!sField) return;
      items.push(planCopyCell(ctx, tRi, tCi, tField, srcCell.ri, srcCell.ci, sField, onSkip));
    });
  }

  return { items, skippedFormula };
}

// ── Ctrl+D / Ctrl+R 대상 산출(UR-5, §3.3, C9) ────────────────

/**
 * 현재 선택 rect에서 Ctrl+D(아래로)/Ctrl+R(오른쪽으로) 채우기의 source/target rect 산출(순수 함수).
 * 1행(D)/1열(R)뿐이면 채울 대상이 없어 null.
 */
export function ctrlFillSourceTarget(
  rect: CellRange,
  axis: 'down' | 'right',
): { source: CellRange; target: CellRange } | null {
  if (axis === 'down') {
    if (rect.endRow <= rect.startRow) return null;
    return {
      source: { startRow: rect.startRow, endRow: rect.startRow, startCol: rect.startCol, endCol: rect.endCol },
      target: { startRow: rect.startRow + 1, endRow: rect.endRow, startCol: rect.startCol, endCol: rect.endCol },
    };
  }
  if (rect.endCol <= rect.startCol) return null;
  return {
    source: { startRow: rect.startRow, endRow: rect.endRow, startCol: rect.startCol, endCol: rect.startCol },
    target: { startRow: rect.startRow, endRow: rect.endRow, startCol: rect.startCol + 1, endCol: rect.endCol },
  };
}
