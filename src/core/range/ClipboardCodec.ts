/**
 * ClipboardCodec — F1 범위 복사/붙여넣기의 순수 직렬화/플랜 생성 (헤드리스).
 * / ClipboardCodec — pure serialization/plan generation for F1 range copy/paste (headless).
 *
 * 계약 근거: 11_design_F1_v2.md §5(복사/붙여넣기 확장), FR-4, UR-4/UC-6.
 * / Contract basis: 11_design_F1_v2.md §5 (copy/paste extension), FR-4, UR-4/UC-6.
 *
 * 실행(navigator.clipboard 접근, 실제 write)은 배선 단계(KeyboardManager)의 몫이다.
 * 이 모듈은 (a) CellRange → TSV 문자열, (b) TSV/2D 블록 → 붙여넣기 플랜만 순수 계산한다.
 * / Execution (navigator.clipboard access, actual writes) belongs to the wiring layer
 * (KeyboardManager). This module only purely computes (a) CellRange → TSV string and
 * (b) TSV/2D block → paste plan.
 */
import type { CellRange, FlatRowRefLike } from './types.js';

// ── 복사(§5.1, UR-4) / Copy (§5.1, UR-4) ─────────────────────

/**
 * 복사 시 셀 값/표시값 조회 계약(§5.1, UR-4). / Cell value/display-text query contract for copy (§5.1, UR-4).
 */
export interface ClipboardQueryContext {
  /** 열 인덱스(ci) → field 명(없으면 undefined). / Column index (ci) → field name (undefined if none). */
  fieldAt(ci: number): string | undefined;
  /** (행 ri, field) → 원시 셀 값. / (row ri, field) → raw cell value. */
  getCellValue(ri: number, field: string): any;
  /** override 데모 정합: 있으면 표시값 우선(§5.1 주석). / Override-demo alignment: prefer display text when present (§5.1 note). */
  getDisplayText?(ri: number, field: string): string;
}

/**
 * R행×C열 범위 → TSV(행마다 \t조인, 행간 \n) — 엑셀 왕복 호환(UR-4 AC).
 * / R-row × C-col range → TSV (tab-join per row, newline between rows) — Excel round-trip compatible (UR-4 AC).
 *
 * @param rect - 직렬화할 정규화 셀 범위 / Normalized cell range to serialize
 * @param ctx - 셀 값/표시값 조회 컨텍스트 / Cell value/display-text query context
 * @returns TSV 문자열 / TSV string
 */
export function rangeToTSV(rect: CellRange, ctx: ClipboardQueryContext): string {
  const lines: string[] = [];
  for (let ri = rect.startRow; ri <= rect.endRow; ri++) {
    const cells: string[] = [];
    for (let ci = rect.startCol; ci <= rect.endCol; ci++) {
      const field = ctx.fieldAt(ci);
      if (!field) {
        cells.push('');
        continue;
      }
      const text = ctx.getDisplayText ? ctx.getDisplayText(ri, field) : String(ctx.getCellValue(ri, field) ?? '');
      cells.push(text);
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/**
 * TSV 문자열 → 2D 블록(행×열 문자열 배열). 빈 문자열은 1×1 빈 블록.
 * / TSV string → 2D block (row×col string array). Empty string yields a 1×1 empty block.
 *
 * @param text - 붙여넣기 원본 TSV 문자열 / Source TSV string to paste
 * @returns 행×열 2D 문자열 블록 / Row×col 2D string block
 */
export function parseTSV(text: string): string[][] {
  if (text === '') return [['']];
  return text.split('\n').map(line => line.split('\t'));
}

// ── 붙여넣기 플랜(§5.2, FR-4) / Paste plan (§5.2, FR-4) ───────

/**
 * 붙여넣기 플랜 생성에 필요한 행 해소/편집 가능 조회 계약(§5.2).
 * / Row-resolution / editability query contract needed to build a paste plan (§5.2).
 */
export interface PastePlanContext {
  /** flat index → 행 참조(kind/rowId). / flat index → row reference (kind/rowId). */
  resolveFlatRow(ri: number): FlatRowRefLike;
  /** 열 인덱스(ci) → field 명(없으면 undefined). / Column index (ci) → field name (undefined if none). */
  fieldAt(ci: number): string | undefined;
  /** 기본 true(잠금 없음). / Defaults to true (no lock). */
  isEditable?(rowId: string, field: string): boolean;
}

/**
 * 붙여넣기 플랜의 셀별 항목(값 기록 또는 skip). / Per-cell item of a paste plan (write value or skip).
 */
export interface PastePlanItem {
  /** 대상 행의 flat index. / Flat index of the target row. */
  rowIndex: number;
  /** 대상 컬럼 field 명. / Target column field name. */
  field: string;
  /** 수행 동작: 값 기록 또는 건너뜀. / Action: write value or skip. */
  action: 'value' | 'skip';
  /** 기록할 값(action==='value'일 때). / Value to write (when action==='value'). */
  value?: any;
  /** skip 사유(예: 'non-data-row', 'not-editable'). / Skip reason (e.g. 'non-data-row', 'not-editable'). */
  reason?: string;
}

/**
 * 붙여넣기 소스 블록(2D) + 타깃 range → 플랜.
 * / Paste source block (2D) + target range → plan.
 *
 * 소스가 타깃보다 작으면 타일 반복, 크면(또는 같으면) 블록 그대로 전개(타깃 크기 무시) — 엑셀 규칙(FR-4 AC).
 * `r % blockRows`/`c % blockCols` 단일 공식으로 두 경우 모두 성립(작을 때=주기 반복, 클 때=outRows=blockRows라 항상 r 자신).
 * / When the source is smaller than the target it tiles; when equal or larger it expands the block
 * verbatim (ignoring target size) — Excel rule (FR-4 AC). The single `r % blockRows` / `c % blockCols`
 * formula covers both cases (smaller = periodic tiling; larger = outRows equals blockRows so it is always r itself).
 *
 * @param block - 붙여넣기 소스 2D 블록 / 2D source block to paste
 * @param target - 타깃 셀 범위 / Target cell range
 * @param ctx - 행 해소/편집가능 조회 컨텍스트 / Row-resolution / editability query context
 * @returns 셀별 붙여넣기 플랜 항목 배열 / Array of per-cell paste plan items
 */
export function buildPastePlan(block: string[][], target: CellRange, ctx: PastePlanContext): PastePlanItem[] {
  const blockRows = block.length;
  const blockCols = blockRows > 0 ? Math.max(...block.map(r => r.length)) : 0;
  if (blockRows === 0 || blockCols === 0) return [];

  const targetRows = target.endRow - target.startRow + 1;
  const targetCols = target.endCol - target.startCol + 1;
  const outRows = Math.max(targetRows, blockRows);
  const outCols = Math.max(targetCols, blockCols);

  const items: PastePlanItem[] = [];
  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      const ri = target.startRow + r;
      const ci = target.startCol + c;
      const field = ctx.fieldAt(ci);
      if (!field) continue;

      const ref = ctx.resolveFlatRow(ri);
      if (ref.kind !== 'data' || !ref.rowId) {
        items.push({ rowIndex: ri, field, action: 'skip', reason: 'non-data-row' });
        continue;
      }
      if (ctx.isEditable && !ctx.isEditable(ref.rowId, field)) {
        items.push({ rowIndex: ri, field, action: 'skip', reason: 'not-editable' });
        continue;
      }
      const srcVal = block[r % blockRows]?.[c % blockCols] ?? '';
      items.push({ rowIndex: ri, field, action: 'value', value: srcVal });
    }
  }
  return items;
}
