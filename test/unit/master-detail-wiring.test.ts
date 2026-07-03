import { describe, it, expect, vi, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

function makeGrid(extraOpts: Record<string, any> = {}) {
  const container = document.createElement('div');
  container.style.width  = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  return new OpenGrid(container, {
    columns: [
      { field: 'name', header: '이름', width: 120 },
      { field: 'dept', header: '부서', width: 100 },
    ],
    height: 400,
    rowHeight: 32,
    ...extraOpts,
  });
}

const sampleData = [
  { name: '홍길동', dept: '개발팀' },
  { name: '김철수', dept: '마케팅팀' },
  { name: '이영희', dept: '인사팀' },
];

/** jsdom 은 실레이아웃이 없어 container.getBoundingClientRect()==0 → _onResize 가 조기 return
 * 해서 첫 렌더가 지연된다. 셀/패널 DOM 이 필요한 테스트는 이걸로 동기 강제(F1 배선 테스트와 동형). */
function renderNow(grid: OpenGrid<any>): void {
  (grid as any)._doRender(...(grid as any)._visRange());
}

function bodyEl(grid: OpenGrid<any>): HTMLElement {
  return (grid as any)._renderer.bodyWrapper as HTMLElement;
}

function rowIdAt(grid: OpenGrid<any>, flatIndex: number): string {
  const ref = grid.getFlatRowModel().resolveFlatRow(flatIndex);
  return ref.rowId as string;
}

describe('F2 배선 — 펼침→flat 증가·렌더·패널 DOM(FR-1)', () => {
  it('expandRow(0) 후 flat 총 행수가 span 만큼 늘고 패널 DOM 이 생긴다', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 64 } }); // span=ceil(64/32)=2
    grid.setData(sampleData);
    renderNow(grid);
    const before = grid.getFlatRowModel().count();
    expect(before).toBe(3);

    grid.expandRow(0);
    renderNow(grid);

    const after = grid.getFlatRowModel().count();
    // span=ceil(64/32)=2 → head 1개 + filler(span-1=1)개 = 총 2개 추가
    expect(after).toBe(before + 2);

    const panel = bodyEl(grid).querySelector('.og-detail-panel') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.dataset.ogRowId).toBeTruthy();
    expect(panel.id).toBe(`og-detail-${panel.dataset.ogRowId}`);
  });

  it('isRowExpanded/getFlatRowModel().resolveFlatRow 가 head/filler kind 를 올바르게 판별한다', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 64 } });
    grid.setData(sampleData);
    renderNow(grid);
    grid.expandRow(0);
    renderNow(grid);

    expect(grid.isRowExpanded(0)).toBe(true);
    const fm = grid.getFlatRowModel();
    // flat: [head(row0 마스터 그 자체는 kind:'data' 그대로 idx0), detailHead(idx1), detailFiller(idx2), row1(idx3), row2(idx4)]
    expect(fm.resolveFlatRow(0).kind).toBe('data');
    expect(fm.resolveFlatRow(1).kind).toBe('detailHead');
    expect(fm.resolveFlatRow(2).kind).toBe('detailFiller');
    expect(fm.resolveFlatRow(3).kind).toBe('data');
  });
});

describe('F2 배선 — 접힘(FR-2)', () => {
  it('collapseRow 후 패널 DOM 제거 + flat 총 행수 원복', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 64 } });
    grid.setData(sampleData);
    renderNow(grid);
    const base = grid.getFlatRowModel().count();

    grid.expandRow(0);
    renderNow(grid);
    expect(grid.getFlatRowModel().count()).toBe(base + 2);

    grid.collapseRow(0);
    renderNow(grid);

    expect(grid.getFlatRowModel().count()).toBe(base);
    expect(bodyEl(grid).querySelector('.og-detail-panel')).toBeNull();
    expect(grid.isRowExpanded(0)).toBe(false);
  });

  it('toggleRow 는 펼침↔접힘을 오간다', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 32 } });
    grid.setData(sampleData);
    renderNow(grid);

    grid.toggleRow(0);
    renderNow(grid);
    expect(grid.isRowExpanded(0)).toBe(true);

    grid.toggleRow(0);
    renderNow(grid);
    expect(grid.isRowExpanded(0)).toBe(false);
  });
});

describe('F2 배선 — mount-once/서브그리드(자식) 생존(NFR-2)', () => {
  it('renderer 는 펼침당 정확히 1회만 호출되고, 이후 여러 재렌더(스크롤 흉내)에도 재호출되지 않는다', () => {
    const createSpy = vi.fn();
    const grid = makeGrid({
      masterDetail: {
        enabled: true,
        height: 32,
        renderer: (row: any, host: HTMLElement) => {
          createSpy();
          const div = document.createElement('div');
          div.className = 'my-detail-content';
          div.textContent = row.name;
          host.appendChild(div);
        },
      },
    });
    grid.setData(sampleData);
    renderNow(grid);
    grid.expandRow(0);
    renderNow(grid);
    expect(createSpy).toHaveBeenCalledTimes(1);

    // 여러 차례 재렌더(스크롤/기타 갱신 흉내) — mount-once 보장: create 재호출 없음.
    renderNow(grid);
    renderNow(grid);
    renderNow(grid);
    expect(createSpy).toHaveBeenCalledTimes(1);

    // 콘텐츠(내부 DOM)도 그대로 생존.
    const panel = bodyEl(grid).querySelector('.og-detail-panel') as HTMLElement;
    expect(panel.querySelector('.my-detail-content')?.textContent).toBe('홍길동');
  });

  it('스크롤 아웃(뷰포트 밖 렌더)→아웃 후 재진입해도 host/instance 참조가 동일하다(detach≠delete)', () => {
    const createSpy = vi.fn();
    const grid = makeGrid({
      masterDetail: {
        enabled: true, height: 32,
        renderer: (_row: any, host: HTMLElement) => { createSpy(); host.textContent = 'x'; },
      },
    });
    grid.setData(sampleData);
    renderNow(grid);
    grid.expandRow(0);
    renderNow(grid);
    const hostBefore = (grid as any)._detailMgr.getPanelHost(rowIdAt(grid, 0));

    // 뷰포트 밖으로 스크롤된 상황을 흉내: startIndex 를 뒤로 밀어 head 가 범위 밖이 되게 렌더.
    (grid as any)._doRender(10, 20); // 이 그리드는 행이 5개뿐이라 head 는 범위 밖.
    // 다시 정상 범위로 복귀.
    renderNow(grid);

    const hostAfter = (grid as any)._detailMgr.getPanelHost(rowIdAt(grid, 0));
    expect(hostAfter).toBe(hostBefore); // 동일 참조 = 파괴 아님(mount-once)
    expect(createSpy).toHaveBeenCalledTimes(1); // 재진입에도 create 재호출 없음
  });
});

describe('F2 배선 — 정렬 후 펼침 유지(FR-4)', () => {
  it('정렬을 바꿔도 stable rowId 기준으로 펼침 상태가 보존된다', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 32 } });
    grid.setData(sampleData);
    renderNow(grid);

    const rid = rowIdAt(grid, 0); // '홍길동'
    grid.expandRow(0);
    renderNow(grid);
    expect(grid.isRowExpanded({ id: rid })).toBe(true);

    grid.orderBy('name', 'desc');
    renderNow(grid);

    expect(grid.isRowExpanded({ id: rid })).toBe(true);
    const panel = bodyEl(grid).querySelector('.og-detail-panel') as HTMLElement;
    expect(panel?.dataset.ogRowId).toBe(rid);
  });
});

describe('F2 배선 — 트리 조합(§7)', () => {
  it('트리 활성 그리드에서도 리프 노드에 detail 을 부착할 수 있다', () => {
    const grid = makeGrid({
      columns: [
        { field: 'id', header: 'id', width: 60 },
        { field: 'name', header: '이름', width: 120 },
      ],
      treeId: 'id', treeParentId: 'parentId',
      masterDetail: { enabled: true, height: 32 },
    });
    grid.setData([
      { id: 1, name: '루트', parentId: null },
      { id: 2, name: '자식', parentId: 1 },
    ] as any);
    (grid as any)._grpMgr.enableTree();
    renderNow(grid);

    const flat = grid.getFlatRowModel().getFlatArray();
    expect(flat.length).toBeGreaterThan(0);
    // 트리 flat 의 첫 노드(루트) rowId 로 펼침
    const rootRef = grid.getFlatRowModel().resolveFlatRow(0);
    expect(rootRef.kind).toBe('tree');
    grid.expandRow({ id: rootRef.rowId! });
    renderNow(grid);

    expect(grid.isRowExpanded({ id: rootRef.rowId! })).toBe(true);
    const panel = bodyEl(grid).querySelector('.og-detail-panel');
    expect(panel).toBeTruthy();
  });
});

describe('F2 배선 — Enter/Space 토글(FR-7)', () => {
  it('expander 에 Enter 키를 누르면 토글된다', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 32 } });
    grid.setData(sampleData);
    renderNow(grid);

    const expander = bodyEl(grid).querySelector('.og-detail-expander') as HTMLElement;
    expect(expander).toBeTruthy();
    expect(grid.isRowExpanded(0)).toBe(false);

    expander.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(grid.isRowExpanded(0)).toBe(true);
  });

  it('Space 키로도 토글된다', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 32 } });
    grid.setData(sampleData);
    renderNow(grid);

    const expander = bodyEl(grid).querySelector('.og-detail-expander') as HTMLElement;
    expander.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(grid.isRowExpanded(0)).toBe(true);
  });
});

describe('F2 배선 — filler 쓰기 skip(INT-01/C0.3)', () => {
  it('writeCells 는 detailFiller/detailHead 대상 flat index 를 건너뛴다', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 64 } }); // span=2
    grid.setData(sampleData);
    renderNow(grid);
    grid.expandRow(0);
    renderNow(grid);

    // flat: [0=data(row0, 마스터), 1=detailHead, 2=detailFiller, 3=data(row1), 4=data(row2)]
    // flat index 0 은 삽입 지점 이전이라 plain display index 와 여전히 일치 — 정상 반영 검증에 사용.
    const rid0 = rowIdAt(grid, 0);
    const skipped = grid.writeCells([
      { rowIndex: 1, field: 'name', value: 'HACK' },
      { rowIndex: 2, field: 'name', value: 'HACK' },
      { rowIndex: 0, field: 'name', value: '변경됨' },
    ]);

    expect(skipped).toBe(2); // detailHead + detailFiller 스킵
    expect((grid as any)._data.getRowById(rid0)?.name).toBe('변경됨'); // 정상 데이터 행은 반영
  });
});

describe('F2 배선 — 회귀 0(NFR-4)', () => {
  it('masterDetail 미지정 그리드는 기존 렌더와 동일하게 동작한다(expander 컬럼 없음)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);

    expect(bodyEl(grid).querySelector('.og-detail-expander')).toBeNull();
    expect(bodyEl(grid).querySelector('.og-detail-panel')).toBeNull();
    expect(grid.getFlatRowModel().count()).toBe(3);
  });

  it('maxDepth=0 이면 expandRow 가 거부된다(FR-10)', () => {
    const grid = makeGrid({ masterDetail: { enabled: true, height: 32, maxDepth: 0 } });
    grid.setData(sampleData);
    renderNow(grid);

    grid.expandRow(0);
    renderNow(grid);
    expect(grid.isRowExpanded(0)).toBe(false);
  });
});
