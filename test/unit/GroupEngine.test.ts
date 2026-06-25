import { describe, it, expect } from 'vitest';
import {
  buildGroups, flattenGroups, collectAllKeys, toggleGroup,
} from '../../src/core/GroupEngine.js';

interface Row {
  id: number;
  dept: string;
  team: string;
  salary: number;
}

const data: Row[] = [
  { id: 1, dept: 'IT',  team: 'Frontend', salary: 5000 },
  { id: 2, dept: 'IT',  team: 'Backend',  salary: 6000 },
  { id: 3, dept: 'IT',  team: 'Frontend', salary: 5500 },
  { id: 4, dept: 'HR',  team: 'Recruit',  salary: 4000 },
  { id: 5, dept: 'HR',  team: 'Recruit',  salary: 4200 },
];

describe('GroupEngine', () => {
  describe('buildGroups', () => {
    it('단일 필드 그룹 - 루트 2개 (IT, HR)', () => {
      const groups = buildGroups(data, ['dept']);
      expect(groups).toHaveLength(2);
    });

    it('그룹 노드의 _isGroup = true', () => {
      const groups = buildGroups(data, ['dept']);
      expect(groups[0]!._isGroup).toBe(true);
    });

    it('_childCount: IT=3, HR=2', () => {
      const groups = buildGroups(data, ['dept']);
      const it = groups.find(g => g._groupValue === 'IT')!;
      const hr = groups.find(g => g._groupValue === 'HR')!;
      expect(it._childCount).toBe(3);
      expect(hr._childCount).toBe(2);
    });

    it('_depth = 0 (루트 레벨)', () => {
      const groups = buildGroups(data, ['dept']);
      expect(groups[0]!._depth).toBe(0);
    });

    it('다단계 그룹 - dept → team', () => {
      const groups = buildGroups(data, ['dept', 'team']);
      const it = groups.find(g => g._groupValue === 'IT')!;
      // IT 아래: Frontend, Backend
      expect(it.children).toHaveLength(2);
      const fe = (it.children as any[]).find(c => c._groupValue === 'Frontend')!;
      expect(fe._depth).toBe(1);
    });

    it('소계(SUM) 계산', () => {
      const groups = buildGroups(data, ['dept'], [{ field: 'salary', op: 'SUM' }]);
      const it = groups.find(g => g._groupValue === 'IT')!;
      expect(it._summary['salary']).toBe(5000 + 6000 + 5500);
    });

    it('소계(AVG) 계산', () => {
      const groups = buildGroups(data, ['dept'], [{ field: 'salary', op: 'AVG' }]);
      const hr = groups.find(g => g._groupValue === 'HR')!;
      expect(hr._summary['salary']).toBeCloseTo((4000 + 4200) / 2);
    });

    it('소계(COUNT) 계산', () => {
      const groups = buildGroups(data, ['dept'], [{ field: 'salary', op: 'COUNT' }]);
      const it = groups.find(g => g._groupValue === 'IT')!;
      expect(it._summary['salary']).toBe(3);
    });

    it('소계(MIN/MAX) 계산', () => {
      const groups = buildGroups(data, ['dept'], [
        { field: 'salary', op: 'MIN' },
      ]);
      const it = groups.find(g => g._groupValue === 'IT')!;
      expect(it._summary['salary']).toBe(5000);
    });

    it('빈 fields → 빈 배열 반환', () => {
      expect(buildGroups(data, [])).toEqual([]);
    });

    it('_expanded: expandedKeys에 없으면 false', () => {
      const groups = buildGroups(data, ['dept']);
      expect(groups[0]!._expanded).toBe(false);
    });
  });

  describe('flattenGroups', () => {
    it('접힌 상태: 루트 그룹 행만 반환', () => {
      const groups = buildGroups(data, ['dept']);
      const flat = flattenGroups(groups);
      expect(flat).toHaveLength(2);
    });

    it('IT 그룹 펼치면 IT + 3 data rows = 4행', () => {
      const keys = new Set(['__dept:IT']);
      const groups = buildGroups(data, ['dept'], [], keys);
      const flat = flattenGroups(groups);
      // IT(펼침): IT 행 + 3 data, HR(접힘): HR 행 = 5
      expect(flat).toHaveLength(5);
    });

    it('전체 펼침: 그룹 2 + 데이터 5 = 7행', () => {
      const keys = new Set(['__dept:IT', '__dept:HR']);
      const groups = buildGroups(data, ['dept'], [], keys);
      const flat = flattenGroups(groups);
      expect(flat).toHaveLength(7);
    });
  });

  describe('collectAllKeys', () => {
    it('단일 필드: 2개 키', () => {
      const groups = buildGroups(data, ['dept']);
      const keys = collectAllKeys(groups);
      expect(keys).toHaveLength(2);
    });

    it('다단계: dept(2) + team(3) = 5개 키', () => {
      const groups = buildGroups(data, ['dept', 'team']);
      const keys = collectAllKeys(groups);
      // IT + HR + Frontend + Backend + Recruit
      expect(keys).toHaveLength(5);
    });
  });

  describe('toggleGroup', () => {
    it('없으면 추가', () => {
      const keys = new Set<string>();
      toggleGroup([], '__dept:IT', keys);
      expect(keys.has('__dept:IT')).toBe(true);
    });

    it('있으면 제거 (토글)', () => {
      const keys = new Set(['__dept:IT']);
      toggleGroup([], '__dept:IT', keys);
      expect(keys.has('__dept:IT')).toBe(false);
    });
  });
});
