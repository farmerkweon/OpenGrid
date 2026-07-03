/**
 * RangeModel — F1 범위 선택의 순수 MODEL (헤드리스, DOM 무관).
 * 계약 근거: 11_design_F1_v2.md §2(범위 MODEL), §3.1~3.3(드래그/Shift 확장), §2.5(재투영, C0.5).
 *
 * YOURDON 원칙(§0): 포인터/키보드 I/O는 이 클래스 밖(배선 단계)에서 좌표(ri,ci)로 환원해 호출하고,
 * 이 클래스는 anchor/focus/identity/rects만 순수하게 갱신한다. DOM 렌더는 이 모델의 투영일 뿐이다.
 *
 * 좌표 해소는 전부 RangeModelHost(FlatRowModel 계약 모양, C0.3)를 경유한다 — `_displayIndexes` 등
 * 내부 구조를 직접 만지지 않는다.
 */
import type { CellCoord, CellRange, Direction, RangeIdentity, RangeModelHost } from './types.js';

/** anchor/focus → 정규화된 CellRange(§2.3). 역방향 드래그(anchor>focus)도 min/max로 정규화. */
export function normalize(a: CellCoord, f: CellCoord): CellRange {
  return {
    startRow: Math.min(a.ri, f.ri),
    endRow: Math.max(a.ri, f.ri),
    startCol: Math.min(a.ci, f.ci),
    endCol: Math.max(a.ci, f.ci),
  };
}

export class RangeModel {
  private _host: RangeModelHost;
  private _anchor: CellCoord = { ri: 0, ci: 0 };
  private _focus: CellCoord = { ri: 0, ci: 0 };
  private _identity: RangeIdentity = { rowIds: [], fields: [] };
  private _rects: CellRange[] = [];
  private _hasSelection = false;
  private _additive = false;

  constructor(host: RangeModelHost) {
    this._host = host;
  }

  // ── 조회 ─────────────────────────────────────────────────

  get hasSelection(): boolean {
    return this._hasSelection;
  }

  getAnchor(): CellCoord {
    return { ...this._anchor };
  }

  getFocus(): CellCoord {
    return { ...this._focus };
  }

  getIdentity(): RangeIdentity {
    return { rowIds: [...this._identity.rowIds], fields: [...this._identity.fields] };
  }

  /** 공개 API 재료(C4): 정규화 rects (없으면 []). MVP는 길이 ≤1. */
  getRangeSelection(): CellRange[] {
    return this._rects.map(r => ({ ...r }));
  }

  /** 공개 API 재료(C4): getRangeSelection()[0] ?? null */
  getActiveRange(): CellRange | null {
    return this._rects[0] ? { ...this._rects[0] } : null;
  }

  /** 복사/채우기 소스 결정용 별칭(§5.1 getPrimaryRect) */
  getPrimaryRect(): CellRange | null {
    return this.getActiveRange();
  }

  /** 정렬/필터 후에도 유지되는 실제 rowId 집합의 현재 flat 위치(오름차순, 화면밖=-1 제외). */
  getProjectedFlatRows(): number[] {
    return this._identity.rowIds
      .map(id => this._host.flatIndexOfRowId(id))
      .filter(i => i >= 0)
      .sort((a, b) => a - b);
  }

  // ── 드래그 선택(UC-1, §3.1) ──────────────────────────────

  /** pointerdown. shift=true면 기존 anchor 유지(있을 때만), 아니면 새 1x1 anchor. */
  beginDrag(ri: number, ci: number, opts: { additive?: boolean; shift?: boolean } = {}): void {
    if (opts.shift && this._hasSelection) {
      this._focus = { ri, ci };
    } else {
      this._anchor = { ri, ci };
      this._focus = { ri, ci };
    }
    this._hasSelection = true;
    this._additive = !!opts.additive;
    this._recompute();
  }

  /** pointermove. */
  updateFocus(ri: number, ci: number): void {
    if (!this._hasSelection) return;
    this._focus = { ri, ci };
    this._recompute();
  }

  /** pointerup — 확정 + 정체성 스냅샷(§2.5). */
  endDrag(): void {
    if (!this._hasSelection) return;
    this.snapshotIdentity();
  }

  get additive(): boolean {
    return this._additive;
  }

  // ── 단일 클릭 / Shift+클릭(UC-2, §3.2) ──────────────────

  /** 클릭(비-Shift): 새 1×1 anchor(FR-1). */
  click(ri: number, ci: number): void {
    this._anchor = { ri, ci };
    this._focus = { ri, ci };
    this._hasSelection = true;
    this._recompute();
    this.snapshotIdentity();
  }

  /** Shift+클릭: anchor 유지, focus만 갱신. anchor 없으면 click으로 위임(UC-2 예외). */
  shiftClickExtend(ri: number, ci: number): void {
    if (!this._hasSelection) {
      this.click(ri, ci);
      return;
    }
    this._focus = { ri, ci };
    this._recompute();
    this.snapshotIdentity();
  }

  // ── Shift+Arrow(UC-3, §3.3) ──────────────────────────────

  /** anchor 고정, focus만 1칸 이동(격자 경계 clamp). 편집 우선순위(C9)는 호출측(KeyboardManager)이 가드. */
  extendFocus(dir: Direction): void {
    if (!this._hasSelection) return;
    const maxRi = Math.max(0, this._host.count() - 1);
    const maxCi = Math.max(0, this._host.visibleFields().length - 1);
    let { ri, ci } = this._focus;
    switch (dir) {
      case 'up':
        ri = Math.max(0, ri - 1);
        break;
      case 'down':
        ri = Math.min(maxRi, ri + 1);
        break;
      case 'left':
        ci = Math.max(0, ci - 1);
        break;
      case 'right':
        ci = Math.min(maxCi, ci + 1);
        break;
    }
    this._focus = { ri, ci };
    this._recompute();
    this.snapshotIdentity();
  }

  // ── 외부에서 직접 rect 지정(setRangeSelection API 재료, §6.2) ──

  setRect(rect: CellRange): void {
    this._anchor = { ri: rect.startRow, ci: rect.startCol };
    this._focus = { ri: rect.endRow, ci: rect.endCol };
    this._hasSelection = true;
    this._rects = [{ ...rect }];
    this.snapshotIdentity();
  }

  /** clearRangeSelection API 재료. */
  clear(): void {
    this._hasSelection = false;
    this._rects = [];
    this._identity = { rowIds: [], fields: [] };
  }

  // ── 정체성 스냅샷 & 재투영(C0.5, §2.5) ───────────────────

  /** 현재 rect를 rowId 집합 × field 집합으로 스냅샷(display-index는 렌더용 투영일 뿐). */
  snapshotIdentity(): void {
    const rect = this._rects[0];
    if (!rect) {
      this._identity = { rowIds: [], fields: [] };
      return;
    }
    const rowIds: string[] = [];
    for (let ri = rect.startRow; ri <= rect.endRow; ri++) {
      const id = this._host.rowIdOfFlat(ri);
      if (id) rowIds.push(id);
    }
    const allFields = this._host.visibleFields();
    const fields = allFields.slice(rect.startCol, rect.endCol + 1);
    this._identity = { rowIds, fields };
  }

  /**
   * 정렬/필터 후 호출(onModelReproject 구독 지점). rowId 집합 → 현재 flat 좌표로 재투영.
   * 사라진 행(flatIndexOfRowId === -1)은 정체성에는 남되 투영(rects)에서는 제외된다(불연속 허용).
   * MVP는 단일 bounding rect로 투영(§2.2 rects 길이 1 방침) — 남아있는 행들의 min/max로 계산.
   */
  reproject(): void {
    if (!this._hasSelection) return;
    if (this._identity.rowIds.length === 0 || this._identity.fields.length === 0) {
      this._rects = [];
      return;
    }
    const flatRows = this._identity.rowIds
      .map(id => this._host.flatIndexOfRowId(id))
      .filter(i => i >= 0);
    const allFields = this._host.visibleFields();
    const colIndices = this._identity.fields
      .map(f => allFields.indexOf(f))
      .filter(i => i >= 0);

    if (flatRows.length === 0 || colIndices.length === 0) {
      this._rects = [];
      return;
    }
    const startRow = Math.min(...flatRows);
    const endRow = Math.max(...flatRows);
    const startCol = Math.min(...colIndices);
    const endCol = Math.max(...colIndices);
    this._rects = [{ startRow, endRow, startCol, endCol }];
    this._anchor = { ri: startRow, ci: startCol };
    this._focus = { ri: endRow, ci: endCol };
  }

  // ── 내부 ─────────────────────────────────────────────────

  private _recompute(): void {
    this._rects = [normalize(this._anchor, this._focus)];
  }
}
