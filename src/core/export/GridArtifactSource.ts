// ============================================================
// DD-15 §2.2 아티팩트 소스 — 화면·export 공용 투영 창구(핵심 seam, REQ-T3-803/805)
// / DD-15 §2.2 artifact source — the shared projection seam for screen & export.
// ------------------------------------------------------------
// 상류 3서브시스템(DD-04 DisplayFormatter · DD-05 CF · DD-02 CoordinateKernel)을 '조립해 한 행을
// 아티팩트로 접는' 유일 지점. 행마다 DisplayFormatter.format 를 호출 = 화면과 '동일 호출'(WYSIWYG).
// raw 는 여기서만 읽고, 접힌 CellArtifact.text 이후로는 채널이 raw 를 볼 API 가 없다(§2.1 물리 담보).
// 순수·헤드리스(주입된 포트만 접근, DOM 미참조).
// ============================================================

import type {
  ColumnFormatSpec, FormatContext, FormatInput, FormatResult, Sign,
} from '../format/types.js';
import type { VisualSpec } from '../cf/encoders.js';
import type {
  CellAlign, CellArtifact, DataState, HeaderArtifact, IArtifactSource,
  ProjectOptions, RowArtifact, RowChunk, RowRange,
} from './types.js';

/**
 * export 가 실제로 필요로 하는 좁은 포맷 포트 — 전체 FormatResult 접근(text 뿐 아니라 rawText/aria/
 * sign/applied). DD-04 DisplayFormatter 가 구조적으로 만족(화면과 동일 인스턴스 주입).
 * / The narrow format port export needs — full FormatResult access; DisplayFormatter satisfies it.
 */
export interface IArtifactFormatter {
  format(input: FormatInput, spec: ColumnFormatSpec, ctx: FormatContext): FormatResult;
}

/** 투영 대상 컬럼 서술(가시 리프 1개). / One visible-leaf column descriptor. */
export interface ArtifactColumn<T> {
  readonly field: string;
  readonly header: string;
  readonly spec: ColumnFormatSpec;
  readonly align: CellAlign;
  readonly widthPx?: number;
  /** raw 접근자(미주입 시 row[field]). / Raw accessor (defaults to row[field]). */
  readonly get?: (row: T) => unknown;
}

/** 병합 배치 조회(DD-02 CoordinateKernel.placeCell 위임 지점). / Placement lookup (delegates to DD-02). */
export type PlacementFn = (
  modelIndex: number,
  colIndex: number,
) => { rowSpan: number; colSpan: number; hidden: boolean } | undefined;

/** CF 시각 스펙 조회(DD-05 evaluate+encode 위임 지점). / CF visual lookup (delegates to DD-05). */
export type CfFn<T> = (row: T, col: ArtifactColumn<T>, modelIndex: number) => VisualSpec | undefined;

/** GridArtifactSource 협력자(생성자 주입). / Collaborators injected into the source. */
export interface GridArtifactSourceDeps<T extends Record<string, any>> {
  /** 논리 순서(정렬/필터 후) 전체 행. / All rows in logical order. */
  readonly rows: () => ReadonlyArray<T>;
  /** 가시 리프 컬럼. / Visible-leaf columns. */
  readonly columns: () => ReadonlyArray<ArtifactColumn<T>>;
  /** DD-04 표시값 파사드(화면과 동일 인스턴스). / DD-04 display formatter (same instance as screen). */
  readonly formatter: IArtifactFormatter;
  /** 포맷 컨텍스트(로케일/테마/consumer). / Format context. */
  readonly ctx: () => FormatContext;
  /** 선택: DD-05 CF 시각 스펙. / Optional: DD-05 CF visual spec. */
  readonly cfFor?: CfFn<T>;
  /** 선택: DD-02 병합 배치. / Optional: DD-02 merge placement. */
  readonly placeFor?: PlacementFn;
  /** 선택: 데이터 상태(기본 ready). / Optional: data state (defaults to ready). */
  readonly state?: () => DataState;
}

/**
 * 화면과 동일 파이프라인에서 아티팩트를 접는 소스 구현(§2.2).
 * export 채널은 이 포트만 알고 상류 셋(DD-04/05/02)을 직접 모른다(의존 역전).
 * / Folds artifacts from the same pipeline as the screen; channels know only this port.
 */
export class GridArtifactSource<T extends Record<string, any> = any> implements IArtifactSource {
  constructor(private readonly d: GridArtifactSourceDeps<T>) {}

  projectHeader(opts: ProjectOptions = {}): ReadonlyArray<ReadonlyArray<HeaderArtifact>> {
    const cols = this._cols(opts);
    return [
      cols.map<HeaderArtifact>(c => ({
        text: c.header,
        field: c.field,
        colSpan: 1,
        rowSpan: 1,
        widthPx: c.widthPx ?? 100,
        align: c.align,
      })),
    ];
  }

  async *projectRows(opts: ProjectOptions = {}): AsyncIterable<RowChunk> {
    const rows = this.d.rows();
    const cols = this._cols(opts);
    const range = this._resolveRange(opts.range, rows.length);
    const chunkRows = Math.max(1, opts.chunkSize ?? 2_000);
    const includeCF = opts.includeCF !== false;

    let buffer: RowArtifact[] = [];
    for (let i = range.start; i < range.end; i++) {
      const row = rows[i]!;
      buffer.push(this._foldRow(row, i, cols, includeCF));
      if (buffer.length >= chunkRows) {
        yield { rows: buffer, done: false };
        buffer = [];
      }
    }
    // 마지막 청크(빈 데이터여도 done:true 로 종료 신호). / Final chunk (even when empty, signals done).
    yield { rows: buffer, done: true };
  }

  totalRows(range?: RowRange): number {
    const n = this.d.rows().length;
    if (!range) return n;
    const r = this._resolveRange(range, n);
    return Math.max(0, r.end - r.start);
  }

  dataState(): DataState {
    return this.d.state ? this.d.state() : 'ready';
  }

  // ── 내부: 한 행을 아티팩트로 접기(화면과 동일 호출) ──
  private _foldRow(
    row: T, modelIndex: number, cols: ReadonlyArray<ArtifactColumn<T>>, includeCF: boolean,
  ): RowArtifact {
    const ctx = this.d.ctx();
    const cells = cols.map<CellArtifact>((col, ci) => {
      const raw = col.get ? col.get(row) : (row as any)[col.field];
      const input: FormatInput = { raw, field: col.field, row };
      // ★ 화면과 '동일 호출' — 재포맷·재조회 금지(REQ-T3-803).
      const fr = this.d.formatter.format(input, col.spec, ctx);
      const place = this.d.placeFor?.(modelIndex, ci);
      const cf = includeCF ? this.d.cfFor?.(row, col, modelIndex) : undefined;

      const cell: {
        text: string; applied: CellArtifact['applied'];
        rowSpan: number; colSpan: number; hidden: boolean; align: CellAlign; type: CellArtifact['type'];
        rawText?: string; aria?: string; sign?: Sign; cf?: VisualSpec; colorHint?: string;
      } = {
        text: fr.text,
        applied: fr.applied,
        rowSpan: place?.rowSpan ?? 1,
        colSpan: place?.colSpan ?? 1,
        hidden: place?.hidden ?? false,
        align: col.align,
        type: col.spec.domain,
      };
      if (fr.rawText !== undefined) cell.rawText = fr.rawText;
      if (fr.aria !== undefined) cell.aria = fr.aria;
      if (fr.sign !== undefined) cell.sign = fr.sign;
      if (cf !== undefined) cell.cf = cf;
      if (fr.colorHint !== undefined) cell.colorHint = fr.colorHint;
      return cell;
    });
    return { modelIndex, cells };
  }

  private _cols(opts: ProjectOptions): ReadonlyArray<ArtifactColumn<T>> {
    const cols = this.d.columns();
    if (!opts.exceptFields || opts.exceptFields.length === 0) return cols;
    const excl = new Set(opts.exceptFields);
    return cols.filter(c => !excl.has(c.field));
  }

  private _resolveRange(range: RowRange | undefined, len: number): RowRange {
    if (!range) return { start: 0, end: len };
    const start = Math.max(0, Math.min(range.start, len));
    const end = Math.max(start, Math.min(range.end, len));
    return { start, end };
  }
}
