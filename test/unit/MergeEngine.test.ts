import { describe, it, expect, beforeEach } from 'vitest';
import { MergeEngine } from '../../src/core/MergeEngine.js';

describe('MergeEngine', () => {
  let engine: MergeEngine;

  beforeEach(() => {
    engine = new MergeEngine();
  });

  describe('applyMergeCells (수동 병합)', () => {
    it('기준 셀의 rowSpan/colSpan 반환', () => {
      engine.applyMergeCells([{ row: 0, col: 1, rowSpan: 3, colSpan: 1 }]);
      const info = engine.getInfo(0, 1)!;
      expect(info.rowSpan).toBe(3);
      expect(info.colSpan).toBe(1);
      expect(info.hidden).toBe(false);
    });

    it('병합된 하위 셀은 hidden=true', () => {
      engine.applyMergeCells([{ row: 0, col: 1, rowSpan: 3, colSpan: 1 }]);
      expect(engine.getInfo(1, 1)!.hidden).toBe(true);
      expect(engine.getInfo(2, 1)!.hidden).toBe(true);
    });

    it('병합 범위 밖 셀은 null', () => {
      engine.applyMergeCells([{ row: 0, col: 1, rowSpan: 2 }]);
      expect(engine.getInfo(3, 1)).toBeNull();
      expect(engine.getInfo(0, 0)).toBeNull();
    });

    it('colSpan 하위 셀도 hidden=true', () => {
      engine.applyMergeCells([{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }]);
      expect(engine.getInfo(0, 0)!.hidden).toBe(false);
      expect(engine.getInfo(0, 1)!.hidden).toBe(true);
    });

    it('rowSpan=1 colSpan=1 기본값 처리', () => {
      engine.applyMergeCells([{ row: 2, col: 3 }]);
      const info = engine.getInfo(2, 3)!;
      expect(info.rowSpan).toBe(1);
      expect(info.colSpan).toBe(1);
      expect(info.hidden).toBe(false);
    });

    it('다중 병합 셀', () => {
      engine.applyMergeCells([
        { row: 0, col: 0, rowSpan: 2 },
        { row: 2, col: 1, colSpan: 3 },
      ]);
      expect(engine.getInfo(0, 0)!.rowSpan).toBe(2);
      expect(engine.getInfo(1, 0)!.hidden).toBe(true);
      expect(engine.getInfo(2, 1)!.colSpan).toBe(3);
      expect(engine.getInfo(2, 2)!.hidden).toBe(true);
      expect(engine.getInfo(2, 3)!.hidden).toBe(true);
    });

    it('applyMergeCells 재호출 시 이전 맵 초기화', () => {
      engine.applyMergeCells([{ row: 0, col: 0, rowSpan: 3 }]);
      engine.applyMergeCells([{ row: 5, col: 0, rowSpan: 2 }]);
      expect(engine.getInfo(1, 0)).toBeNull(); // 이전 병합 사라짐
      expect(engine.getInfo(5, 0)!.hidden).toBe(false);
    });
  });

  describe('applyAutoMerge (자동 병합)', () => {
    const data = [
      { dept: 'IT',  name: 'Alice',   salary: 5000 },
      { dept: 'IT',  name: 'Bob',     salary: 6000 },
      { dept: 'IT',  name: 'Charlie', salary: 5500 },
      { dept: 'HR',  name: 'Dana',    salary: 4000 },
      { dept: 'HR',  name: 'Eve',     salary: 4200 },
    ];

    it('연속 같은 값 → rowSpan 병합', () => {
      engine.applyAutoMerge(data, [0], ['dept']);
      // IT: rows 0,1,2 → rowSpan=3 at (0,0)
      expect(engine.getInfo(0, 0)!.rowSpan).toBe(3);
    });

    it('병합 기준 셀은 hidden=false', () => {
      engine.applyAutoMerge(data, [0], ['dept']);
      expect(engine.getInfo(0, 0)!.hidden).toBe(false);
    });

    it('병합 하위 셀은 hidden=true', () => {
      engine.applyAutoMerge(data, [0], ['dept']);
      expect(engine.getInfo(1, 0)!.hidden).toBe(true);
      expect(engine.getInfo(2, 0)!.hidden).toBe(true);
    });

    it('다른 값 그룹은 별개로 병합', () => {
      engine.applyAutoMerge(data, [0], ['dept']);
      // HR: rows 3,4 → rowSpan=2 at (3,0)
      expect(engine.getInfo(3, 0)!.rowSpan).toBe(2);
      expect(engine.getInfo(4, 0)!.hidden).toBe(true);
    });

    it('모두 다른 값이면 병합 없음', () => {
      engine.applyAutoMerge(data, [1], ['name']);
      expect(engine.getInfo(0, 1)).toBeNull();
    });

    it('단일 행 → 병합 없음', () => {
      engine.applyAutoMerge([data[0]!], [0], ['dept']);
      expect(engine.getInfo(0, 0)).toBeNull();
    });
  });

  describe('clear / isEmpty', () => {
    it('초기 상태: isEmpty=true', () => {
      expect(engine.isEmpty).toBe(true);
    });

    it('병합 후: isEmpty=false', () => {
      engine.applyMergeCells([{ row: 0, col: 0, rowSpan: 2 }]);
      expect(engine.isEmpty).toBe(false);
    });

    it('clear 후: isEmpty=true', () => {
      engine.applyMergeCells([{ row: 0, col: 0, rowSpan: 2 }]);
      engine.clear();
      expect(engine.isEmpty).toBe(true);
      expect(engine.getInfo(0, 0)).toBeNull();
    });
  });
});
