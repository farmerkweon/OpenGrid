// DD-09 테스트 공용 픽스처 — 헤드리스 FakeGrid(CoordResolver + MutationServiceFacade)
// / DD-09 shared test fixtures — headless FakeGrid implementing CoordResolver + MutationServiceFacade.
import type { CoordResolver, MutationServiceFacade, ICommandCtx, FrozenClock } from '../../../src/core/command/index.js';
import { defaultValueEquality } from '../../../src/core/command/index.js';

interface Row {
  id: string;
  data: Record<string, unknown>;
}

/**
 * 인메모리 그리드 모델 — 커맨드의 좌표/변이 협력자를 헤드리스로 충실 재현한다.
 * insertRow 는 실제 DataLayer 처럼 매번 새 rowId 를 발급(재삽입 시 데이터 동일·id 상이).
 */
export class FakeGrid implements CoordResolver, MutationServiceFacade {
  rows: Row[] = [];
  events: string[] = [];
  private _seq = 0;

  constructor(init: Record<string, unknown>[] = []) {
    for (const d of init) this.rows.push({ id: `r${this._seq++}`, data: { ...d } });
  }

  // ── CoordResolver ──
  rowCount(): number {
    return this.rows.length;
  }
  rowIdAt(index: number): string | undefined {
    return this.rows[index]?.id;
  }
  indexOf(rowId: string): number {
    return this.rows.findIndex((r) => r.id === rowId);
  }
  getCellValue(rowId: string, field: string): unknown {
    return this.rows.find((r) => r.id === rowId)?.data[field];
  }
  getRowSnapshot(rowId: string): Record<string, unknown> | undefined {
    const r = this.rows.find((x) => x.id === rowId);
    return r ? { ...r.data } : undefined;
  }

  // ── MutationServiceFacade ──
  writeCell(rowIndex: number, field: string, value: unknown): void {
    const r = this.rows[rowIndex];
    if (r) {
      r.data[field] = value;
      this.events.push('write');
    }
  }
  writeCells(patches: ReadonlyArray<{ rowIndex: number; field: string; value: unknown }>): number {
    let skipped = 0;
    for (const p of patches) {
      if (!this.rows[p.rowIndex]) {
        skipped++;
        continue;
      }
      this.writeCell(p.rowIndex, p.field, p.value);
    }
    return skipped;
  }
  insertRow(item: Record<string, unknown>, position: number | 'first' | 'last' | 'before' | 'after' = 'last'): void {
    const row: Row = { id: `r${this._seq++}`, data: { ...item } };
    const idx =
      position === 'last' || position === 'after'
        ? this.rows.length
        : position === 'first' || position === 'before'
          ? 0
          : Math.max(0, Math.min(position as number, this.rows.length));
    this.rows.splice(idx, 0, row);
    this.events.push('insert');
  }
  deleteRows(indices: readonly number[]): void {
    const sorted = [...indices].sort((a, b) => b - a);
    for (const i of sorted) this.rows.splice(i, 1);
    this.events.push('delete');
  }
  beginBatch(): void {
    this.events.push('begin');
  }
  endBatch(): void {
    this.events.push('end');
  }

  /** 현재 데이터 배열(값만) — 스냅샷 비교용. / Current data array (values only) for snapshot compares. */
  snapshotData(): Record<string, unknown>[] {
    return this.rows.map((r) => ({ ...r.data }));
  }
}

/** 고정 시계 — do 시각을 결정론적으로. / Fixed clock for deterministic do-time. */
export function fixedClock(t = 1000): FrozenClock {
  return { now: () => t };
}

/** FakeGrid 로부터 ICommandCtx 구성. / Build an ICommandCtx from a FakeGrid. */
export function ctxOf(grid: FakeGrid, clock: FrozenClock = fixedClock()): ICommandCtx {
  return { mutation: grid, coords: grid, values: defaultValueEquality, clock };
}
