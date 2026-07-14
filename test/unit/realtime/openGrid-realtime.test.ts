// ============================================================
// DD-07(RT) 코어 배선 — OpenGrid ↔ realtime/ 컨트롤러 왕복(jsdom).
// setRealtimeSource 로 소스가 배선되어 델타가 기존 MutationService 경로로 실제 그리드 데이터에
// 적용되는지, 그리고 미배선 시 byte-identical(_rt=null)·never-throw·지연조립·destroy 정리를 검증한다.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid';
import type {
  IRealtimeSource, RtPayload, DeltaPayload, ConnectionState, ConnectionStatus,
} from '../../../src/core/realtime/index.js';
import { ManualFrame } from './_helpers';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
});

interface Row { name: string; amount: number }

function makeGrid(extraOpts: Record<string, any> = {}) {
  const container = document.createElement('div');
  container.style.width = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  const grid = new OpenGrid<Row>(container, {
    columns: [
      { field: 'name', header: '이름', width: 120 },
      { field: 'amount', header: '금액', width: 120, type: 'number' },
    ],
    height: 400,
    ...extraOpts,
  });
  return { grid, container };
}

const sample: Row[] = [
  { name: 'A', amount: 0 },
  { name: 'B', amount: 50 },
  { name: 'C', amount: 100 },
];

/** rowId(=_ogRowId) 를 표시 인덱스로 조회. / Resolve a row's stable rowId by display index. */
function rowIdAt(grid: OpenGrid<Row>, i: number): string {
  return (grid as any)._data.getRowByIndex(i)?.['_ogRowId'] as string;
}

/** 테스트가 델타·상태를 수동 push 하는 fake 소스. / A fake source the test drives manually. */
class FakeSource implements IRealtimeSource<Row> {
  private _dataL = new Set<(p: RtPayload<Row>) => void>();
  private _statusL = new Set<(s: ConnectionState) => void>();
  started = false;
  stopped = false;
  status: ConnectionState = { status: 'idle', retryAttempt: 0 };
  start(): void { this.started = true; }
  stop(): void { this.stopped = true; }
  onData(l: (p: RtPayload<Row>) => void): () => void { this._dataL.add(l); return () => this._dataL.delete(l); }
  onStatus(l: (s: ConnectionState) => void): () => void { this._statusL.add(l); return () => this._statusL.delete(l); }
  pushData(p: RtPayload<Row>): void { for (const l of this._dataL) l(p); }
  pushStatus(status: ConnectionStatus): void {
    this.status = { ...this.status, status };
    for (const l of this._statusL) l(this.status);
  }
}

describe('DD-07(RT) 코어 배선 — additive(byte-identical)·지연조립', () => {
  it('미배선 → _rt=null(런타임 미조립)', () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    expect((grid as any)._rt).toBeNull();
  });

  it('setRealtimeSource → 컨트롤러 조립·소스 start·핸들 반환', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const src = new FakeSource();
    const ctrl = await grid.setRealtimeSource(src);
    expect(ctrl).toBeTruthy();
    expect(src.started).toBe(true);
    expect((grid as any)._rt).toBe(ctrl);
    expect(ctrl.connection.status).toBe('idle');
  });
});

describe('DD-07(RT) 코어 배선 — 델타가 MutationService 경로로 실제 적용', () => {
  it('셀 델타 → 프레임 flush 후 그리드 셀 값 변경', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const frame = new ManualFrame();
    const src = new FakeSource();
    await grid.setRealtimeSource(src, { scheduleFrame: frame.scheduler });

    const id2 = rowIdAt(grid, 2); // amount=100 행
    const delta: DeltaPayload<Row> = {
      kind: 'delta', seq: 1,
      cells: [{ rowId: id2, field: 'amount', value: 999 }],
    };
    src.pushData(delta);
    frame.flush(); // 백프레셔 프레임 경계 flush

    expect((grid as any)._data.getCellValueByRowId(id2, 'amount')).toBe(999);
  });

  it('upsert(신규 rowId) → 행 삽입, remove → 행 제거', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const frame = new ManualFrame();
    const src = new FakeSource();
    await grid.setRealtimeSource(src, { scheduleFrame: frame.scheduler });

    const id0 = rowIdAt(grid, 0);
    src.pushData({
      kind: 'delta', seq: 1,
      upserts: [{ rowId: 'new-1', row: { name: 'Z', amount: 7 } }],
      removes: [id0],
    });
    frame.flush();

    const rows = (grid as any)._data.getData() as Row[];
    expect(rows.some((r) => r.name === 'Z' && r.amount === 7)).toBe(true);
    expect(rows.some((r) => (r as any)['_ogRowId'] === id0)).toBe(false);
  });

  it('스냅샷 → 기존 setData 경로로 전체 교체', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const frame = new ManualFrame();
    const src = new FakeSource();
    await grid.setRealtimeSource(src, { scheduleFrame: frame.scheduler });

    src.pushData({ kind: 'snapshot', seq: 1, rows: [{ name: 'ONLY', amount: 1 }] });
    frame.flush();

    const rows = (grid as any)._data.getData() as Row[];
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe('ONLY');
  });
});

describe('DD-07(RT) 코어 배선 — 연결 상태·never-throw·정리', () => {
  it('onConnection → 소스 상태 전이 관측', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const src = new FakeSource();
    const ctrl = await grid.setRealtimeSource(src);
    const seen: string[] = [];
    ctrl.onConnection((s) => seen.push(s.status));
    src.pushStatus('connecting');
    src.pushStatus('open');
    expect(seen).toEqual(['connecting', 'open']);
    expect(ctrl.connection.status).toBe('open');
  });

  it('재호출 → 이전 소스 detach 후 교체', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const a = new FakeSource();
    const b = new FakeSource();
    await grid.setRealtimeSource(a);
    await grid.setRealtimeSource(b);
    expect(a.stopped).toBe(true);
    expect(b.started).toBe(true);
    expect((grid as any)._rt).not.toBeNull();
  });

  it('disconnectRealtime → source.stop·_rt=null·멱등', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const src = new FakeSource();
    await grid.setRealtimeSource(src);
    grid.disconnectRealtime();
    expect(src.stopped).toBe(true);
    expect((grid as any)._rt).toBeNull();
    expect(() => grid.disconnectRealtime()).not.toThrow(); // 멱등
  });

  it('destroy → 실시간 detach(누수 방지)', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const src = new FakeSource();
    await grid.setRealtimeSource(src);
    grid.destroy();
    expect(src.stopped).toBe(true);
    expect((grid as any)._rt).toBeNull();
  });
});
