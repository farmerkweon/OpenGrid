// DD-07 실시간 테스트 헬퍼 — 인메모리 모델·수동 시계·fake 전송/sink. / DD-07 realtime test helpers.
import type { ICommand, ICommandCtx } from '../../../src/core/command/ICommand.js';
import { defaultValueEquality } from '../../../src/core/command/ICommand.js';
import type {
  FrameScheduler,
  LiveStateSource,
  RtCommandSink,
  RtCoords,
  SelectionAnchor,
  ScrollAnchor,
  EditingState,
  TimerScheduler,
} from '../../../src/core/realtime/index.js';
import type { StreamTransport } from '../../../src/core/realtime/index.js';

export interface Row {
  id: string;
  [k: string]: unknown;
}

/** 인메모리 그리드 모델 — MutationServiceFacade + CoordResolver + RtCoords 를 함께 만족. */
export class FakeModel {
  rows: Row[];
  writeCallCount = 0;
  batchDepth = 0;

  constructor(rows: Row[] = []) {
    this.rows = rows.map((r) => ({ ...r }));
  }

  // ── MutationServiceFacade ──
  writeCell(rowIndex: number, field: string, value: unknown): void {
    this.writeCallCount++;
    const r = this.rows[rowIndex];
    if (r) r[field] = value;
  }
  writeCells(patches: ReadonlyArray<{ rowIndex: number; field: string; value: unknown }>): number {
    for (const p of patches) this.writeCell(p.rowIndex, p.field, p.value);
    return patches.length;
  }
  insertRow(item: Partial<Row>, position?: number | 'first' | 'last' | 'before' | 'after'): void {
    if (position === 'first') this.rows.unshift({ ...(item as Row) });
    else this.rows.push({ ...(item as Row) });
  }
  deleteRows(indices: readonly number[]): void {
    for (const i of [...indices].sort((a, b) => b - a)) this.rows.splice(i, 1);
  }
  beginBatch(): void {
    this.batchDepth++;
  }
  endBatch(): void {
    this.batchDepth--;
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
    const r = this.rows.find((x) => x.id === rowId);
    return r ? r[field] : undefined;
  }
  getRowSnapshot(rowId: string): Record<string, unknown> | undefined {
    const r = this.rows.find((x) => x.id === rowId);
    return r ? { ...r } : undefined;
  }

  // ── RtCoords ──
  rowIdToIndex(rowId: string): number {
    return this.indexOf(rowId);
  }
  indexToRowId(index: number): string | undefined {
    return this.rowIdAt(index);
  }

  ctx(now = () => 1000): ICommandCtx {
    return {
      mutation: this,
      coords: this,
      values: defaultValueEquality,
      clock: { now },
    };
  }

  asCoords(): RtCoords {
    return this;
  }
}

/** RtApplyCommand 를 실제 ctx 로 do 실행하는 fake sink(DD-09 CommandBus.dispatchSilent 대역). */
export class FakeSink<T = unknown> implements RtCommandSink<T> {
  dispatched: ICommand<T>[] = [];
  batchDepth = 0;
  constructor(private readonly _ctx: ICommandCtx) {}
  dispatchSilent(cmd: ICommand<T>): void {
    this.dispatched.push(cmd);
    cmd.do(this._ctx);
  }
  beginBatch(): void {
    this.batchDepth++;
  }
  endBatch(): void {
    this.batchDepth--;
  }
}

/** 인메모리 사용자 상태(선택/스크롤/편집). / In-memory user state. */
export class FakeStateSource implements LiveStateSource {
  selection: SelectionAnchor[] = [];
  scroll: ScrollAnchor = { pixelWithinRow: 0, scrollLeft: 0 };
  editing: EditingState | undefined;
  sortFilterSig = 'sig0';

  readSelection(): readonly SelectionAnchor[] {
    return this.selection;
  }
  readScroll(): ScrollAnchor {
    return this.scroll;
  }
  readEditing(): EditingState | undefined {
    return this.editing;
  }
  readSortFilterSig(): string {
    return this.sortFilterSig;
  }
  writeSelection(sel: readonly SelectionAnchor[]): void {
    this.selection = [...sel];
  }
  writeScroll(scroll: ScrollAnchor): void {
    this.scroll = scroll;
  }
  writeEditing(editing: EditingState | undefined): void {
    this.editing = editing;
  }
}

/** 수동 지연 타이머 — 폴링/backoff 결정론 테스트. / Manual delay timer. */
export class ManualTimer {
  private _q: { id: number; cb: () => void; delay: number }[] = [];
  private _seq = 0;
  readonly scheduler: TimerScheduler = (cb, delay) => {
    const id = ++this._seq;
    this._q.push({ id, cb, delay });
    return {
      cancel: () => {
        this._q = this._q.filter((e) => e.id !== id);
      },
    };
  };
  get pending(): number {
    return this._q.length;
  }
  /** 현재 세대의 콜백 모두 실행(실행 중 추가분은 다음 세대). / Run one generation. */
  runAll(): void {
    const cur = this._q;
    this._q = [];
    for (const e of cur) e.cb();
  }
  /** 가장 먼저 예약된 콜백 1개 실행. / Run the earliest scheduled callback. */
  runNext(): void {
    const e = this._q.shift();
    if (e) e.cb();
  }
}

/** 수동 프레임 스케줄러 — 백프레셔 flush 결정론. / Manual frame scheduler. */
export class ManualFrame {
  private _q: (() => void)[] = [];
  readonly scheduler: FrameScheduler = (cb) => {
    this._q.push(cb);
    return {
      cancel: () => {
        this._q = this._q.filter((c) => c !== cb);
      },
    };
  };
  get pending(): number {
    return this._q.length;
  }
  flush(): void {
    const cur = this._q;
    this._q = [];
    for (const c of cur) c();
  }
}

/** fake 스트리밍 전송 — 테스트가 onOpen/onMessage/onClose/onError 를 수동 구동. / Fake transport. */
export class FakeTransport implements StreamTransport {
  handlers: {
    onMessage: (raw: string | ArrayBuffer) => void;
    onOpen: () => void;
    onClose: (why?: unknown) => void;
    onError: (e: unknown) => void;
  } | null = null;
  openCount = 0;
  closeCount = 0;

  open(handlers: NonNullable<FakeTransport['handlers']>): void {
    this.handlers = handlers;
    this.openCount++;
  }
  close(): void {
    this.closeCount++;
  }
  emitOpen(): void {
    this.handlers?.onOpen();
  }
  emitMessage(raw: string | ArrayBuffer): void {
    this.handlers?.onMessage(raw);
  }
  emitClose(why?: unknown): void {
    this.handlers?.onClose(why);
  }
  emitError(e: unknown): void {
    this.handlers?.onError(e);
  }
}

/** 매크로태스크 플러시(fetcher Promise 해소 대기). / Flush macrotasks. */
export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
