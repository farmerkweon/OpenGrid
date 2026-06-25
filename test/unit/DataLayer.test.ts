import { describe, it, expect, beforeEach } from 'vitest';
import { DataLayer } from '../../src/core/DataLayer.js';

interface TestRow {
  id: number;
  name: string;
  value: number;
  _ogRowId?: string;
}

describe('DataLayer', () => {
  let dl: DataLayer<TestRow>;
  const sampleData: TestRow[] = [
    { id: 1, name: 'Alice', value: 100 },
    { id: 2, name: 'Bob',   value: 200 },
    { id: 3, name: 'Charlie', value: 50 },
  ];

  beforeEach(() => {
    dl = new DataLayer<TestRow>();
    dl.setData([...sampleData]);
  });

  it('setData - 데이터 설정 후 rowCount 일치', () => {
    expect(dl.rowCount).toBe(3);
  });

  it('getData - 전체 데이터 반환', () => {
    expect(dl.getData().length).toBe(3);
  });

  it('getCellValue - 셀 값 읽기', () => {
    expect(dl.getCellValue(0, 'name')).toBe('Alice');
    expect(dl.getCellValue(1, 'value')).toBe(200);
  });

  it('addRow - 행 추가 (last)', () => {
    dl.addRow({ id: 4, name: 'Diana', value: 300 }, 'last');
    expect(dl.rowCount).toBe(4);
    expect(dl.getCellValue(3, 'name')).toBe('Diana');
  });

  it('addRow - 행 추가 (first)', () => {
    dl.addRow({ id: 0, name: 'Zero', value: 0 }, 'first');
    expect(dl.rowCount).toBe(4);
    expect(dl.getCellValue(0, 'name')).toBe('Zero');
  });

  it('removeRow - 행 삭제 (soft)', () => {
    dl.removeRow(1);
    expect(dl.rowCount).toBe(2);
    expect(dl.getRemovedRows().length).toBe(1);
  });

  it('updateCell - 셀 수정 후 상태 변경', () => {
    dl.updateCell(0, 'name', 'Alice Updated');
    expect(dl.getCellValue(0, 'name')).toBe('Alice Updated');
    expect(dl.getChangedRows().length).toBe(1);
  });

  it('getAddedRows - 새로 추가된 행만 반환', () => {
    dl.addRow({ id: 99, name: 'New', value: 0 });
    expect(dl.getAddedRows().length).toBe(1);
    expect(dl.getChangedRows().length).toBe(0);
  });

  it('applySort - 오름차순 정렬', () => {
    dl.applySort([{ field: 'value', dir: 'asc' }]);
    expect(dl.getCellValue(0, 'value')).toBe(50);
    expect(dl.getCellValue(2, 'value')).toBe(200);
  });

  it('applySort - 내림차순 정렬', () => {
    dl.applySort([{ field: 'value', dir: 'desc' }]);
    expect(dl.getCellValue(0, 'value')).toBe(200);
    expect(dl.getCellValue(2, 'value')).toBe(50);
  });

  it('applyFilter - 조건 필터링', () => {
    dl.applyFilter({ value: [{ operator: '>=', value: 100 }] });
    expect(dl.rowCount).toBe(2);
  });

  it('applyFilter - contains 필터', () => {
    dl.applyFilter({ name: [{ operator: 'contains', value: 'li' }] });
    expect(dl.rowCount).toBe(2); // Alice, Charlie
  });

  it('clearData - 전체 초기화', () => {
    dl.clearData();
    expect(dl.rowCount).toBe(0);
    expect(dl.getAddedRows().length).toBe(0);
  });

  it('getRowsWithState - 상태 필드 포함 반환', () => {
    dl.addRow({ id: 99, name: 'New', value: 0 });
    dl.updateCell(0, 'name', 'Updated');
    const result = dl.getRowsWithState('_state');
    const added = result.filter((r: any) => r._state === 'added');
    const edited = result.filter((r: any) => r._state === 'edited');
    expect(added.length).toBe(1);
    expect(edited.length).toBe(1);
  });
});
