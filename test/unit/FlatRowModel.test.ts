import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

// jsdom 환경에 없는 ResizeObserver mock (다른 유닛 테스트와 동일 패턴)
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
      { field: 'name', header: '이름', width: 120, editable: true },
      { field: 'dept', header: '부서', width: 100, editable: true },
    ],
    height: 400,
    ...extraOpts,
  });
}

const flatData = [
  { name: '홍길동', dept: '개발팀' },
  { name: '김철수', dept: '마케팅팀' },
  { name: '이영희', dept: '인사팀' },
];

const treeData = [
  { id: 1, parentId: null, name: '루트' },
  { id: 2, parentId: 1,    name: '자식1' },
  { id: 3, parentId: 1,    name: '자식2' },
];

// ── Phase 0(C0.3) — FlatRowModel: baseline 공통 인프라 ─────────────────────
describe('FlatRowModel — plain 모드', () => {
  it('count()는 표시 행 수와 일치한다', () => {
    const grid = makeGrid();
    grid.setData(flatData);
    expect(grid.getFlatRowModel().count()).toBe(3);
  });

  it('resolveFlatRow: kind=data, rowId·displayIndex 채워짐', () => {
    const grid = makeGrid();
    grid.setData(flatData);
    const model = grid.getFlatRowModel();
    const rows = grid.getData();

    const ref0 = model.resolveFlatRow(0);
    expect(ref0.kind).toBe('data');
    expect(ref0.rowId).toBe((rows[0] as any)._ogRowId);
    expect(ref0.displayIndex).toBe(0);
    expect(typeof ref0.dataIndex).toBe('number');
  });

  it('rowId ↔ flatIndex 왕복(round trip)', () => {
    const grid = makeGrid();
    grid.setData(flatData);
    const model = grid.getFlatRowModel();
    const rows = grid.getData();
    const rid1 = (rows[1] as any)._ogRowId;

    expect(model.flatIndexOfRowId(rid1)).toBe(1);
    expect(model.rowIdOfFlat(1)).toBe(rid1);
  });

  it('존재하지 않는 rowId → flatIndexOfRowId 는 -1', () => {
    const grid = makeGrid();
    grid.setData(flatData);
    expect(grid.getFlatRowModel().flatIndexOfRowId('no-such-id')).toBe(-1);
  });

  it('필터로 화면에서 사라진 행 → flatIndexOfRowId 는 -1 (접힘/필터아웃)', () => {
    const grid = makeGrid();
    grid.setData(flatData);
    const model = grid.getFlatRowModel();
    const hiddenId = (grid.getData()[0] as any)._ogRowId; // '개발팀' 행

    grid.setFilter('dept', [{ operator: '=', value: '마케팅팀' }]);

    expect(model.flatIndexOfRowId(hiddenId)).toBe(-1);
    // 남은 유일한 행은 kind=data 로 정상 해소된다
    expect(model.count()).toBe(1);
    expect(model.resolveFlatRow(0).kind).toBe('data');
  });
});

describe('FlatRowModel — group 모드', () => {
  it('전부 접힌 상태: count = 그룹 헤더 수, kind=group, rowId 없음', () => {
    const grid = makeGrid();
    grid.setData(flatData);
    grid.groupBy(['dept']); // 3개 부서 전부 유니크 → 헤더 3개, 전부 접힘

    const model = grid.getFlatRowModel();
    expect(model.count()).toBe(3);
    const ref = model.resolveFlatRow(0);
    expect(ref.kind).toBe('group');
    expect(ref.rowId).toBeUndefined();
    expect(model.rowIdOfFlat(0)).toBeNull();
  });

  it('전개 후: 데이터 행이 kind=data 로 섞여 나오고 rowId 왕복 성립', () => {
    const grid = makeGrid();
    grid.setData(flatData);
    grid.groupBy(['dept']);
    grid.expandAll();

    const model = grid.getFlatRowModel();
    // [group, row, group, row, group, row] = 6
    expect(model.count()).toBe(6);

    const dataRefs = Array.from({ length: 6 }, (_, i) => model.resolveFlatRow(i))
      .filter(r => r.kind === 'data');
    expect(dataRefs.length).toBe(3);

    const knownId = (grid.getData()[1] as any)._ogRowId; // '김철수' 행
    const flatIdx = model.flatIndexOfRowId(knownId);
    expect(flatIdx).toBeGreaterThanOrEqual(0);
    expect(model.resolveFlatRow(flatIdx).kind).toBe('data');
    expect(model.rowIdOfFlat(flatIdx)).toBe(knownId);
  });

  it('clearGroup() 이후 plain backing 으로 복귀', () => {
    const grid = makeGrid();
    grid.setData(flatData);
    grid.groupBy(['dept']);
    grid.clearGroup();

    const model = grid.getFlatRowModel();
    expect(model.count()).toBe(3);
    expect(model.resolveFlatRow(0).kind).toBe('data');
  });
});

describe('FlatRowModel — tree 모드', () => {
  it('접힌 루트만 노출: count=1, kind=tree, rowId=루트의 _ogRowId', () => {
    const grid = makeGrid({ treeId: 'id', treeParentId: 'parentId' });
    grid.setData(treeData);
    grid.enableTree(); // expandOnLoad 기본 false → 자식 접힘

    const model = grid.getFlatRowModel();
    expect(model.count()).toBe(1);
    const ref = model.resolveFlatRow(0);
    expect(ref.kind).toBe('tree');
    expect(ref.rowId).toBe((grid.getData()[0] as any)._ogRowId);
  });

  it('노드 펼침 후 자식이 flat 에 나타나고 rowId 왕복 성립, 접으면 -1', () => {
    const grid = makeGrid({ treeId: 'id', treeParentId: 'parentId' });
    grid.setData(treeData);
    grid.enableTree();
    grid.expandNodes(1, true);

    const model = grid.getFlatRowModel();
    expect(model.count()).toBe(3);

    const childId = (grid.getData()[1] as any)._ogRowId; // 자식1
    const flatIdx = model.flatIndexOfRowId(childId);
    expect(flatIdx).toBe(1);
    expect(model.resolveFlatRow(flatIdx).kind).toBe('tree');

    grid.expandNodes(1, false); // 다시 접기 → 자식 flat 아웃
    expect(model.flatIndexOfRowId(childId)).toBe(-1);
  });

  it('disableTree() 이후 plain backing 으로 복귀', () => {
    const grid = makeGrid({ treeId: 'id', treeParentId: 'parentId' });
    grid.setData(treeData);
    grid.enableTree();
    grid.disableTree();

    const model = grid.getFlatRowModel();
    expect(model.count()).toBe(3);
    expect(model.resolveFlatRow(0).kind).toBe('data');
  });
});
