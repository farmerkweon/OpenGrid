/**
 * ClipboardCodec — F1 범위 복사/붙여넣기의 순수 직렬화/플랜 생성 (헤드리스).
 * 계약 근거: 11_design_F1_v2.md §5(복사/붙여넣기 확장), FR-4, UR-4/UC-6.
 *
 * 실행(navigator.clipboard 접근, 실제 write)은 배선 단계(KeyboardManager)의 몫이다.
 * 이 모듈은 (a) CellRange → TSV 문자열, (b) TSV/2D 블록 → 붙여넣기 플랜만 순수 계산한다.
 */
import type { CellRange, FlatRowRefLike } from './types.js';

// ── 복사(§5.1, UR-4) ─────────────────────────────────────────

export interface ClipboardQueryContext {
  fieldAt(ci: number): string | undefined;
  getCellValue(ri: number, field: string): any;
  /** override 데모 정합: 있으면 표시값 우선(§5.1 주석) */
  getDisplayText?(ri: number, field: string): string;
}

/** R행×C열 범위 → TSV(행마다 \t조인, 행간 \n) — 엑셀 왕복 호환(UR-4 AC). */
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

/** TSV 문자열 → 2D 블록(행×열 문자열 배열). 빈 문자열은 1×1 빈 블록. */
export function parseTSV(text: string): string[][] {
  if (text === '') return [['']];
  return text.split('\n').map(line => line.split('\t'));
}

// ── 붙여넣기 플랜(§5.2, FR-4) ─────────────────────────────────

export interface PastePlanContext {
  resolveFlatRow(ri: number): FlatRowRefLike;
  fieldAt(ci: number): string | undefined;
  /** 기본 true(잠금 없음) */
  isEditable?(rowId: string, field: string): boolean;
}

export interface PastePlanItem {
  rowIndex: number;
  field: string;
  action: 'value' | 'skip';
  value?: any;
  reason?: string;
}

/**
 * 붙여넣기 소스 블록(2D) + 타깃 range → 플랜.
 * 소스가 타깃보다 작으면 타일 반복, 크면(또는 같으면) 블록 그대로 전개(타깃 크기 무시) — 엑셀 규칙(FR-4 AC).
 * `r % blockRows`/`c % blockCols` 단일 공식으로 두 경우 모두 성립(작을 때=주기 반복, 클 때=outRows=blockRows라 항상 r 자신).
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
