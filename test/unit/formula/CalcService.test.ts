// ============================================================
// DD-08 §2.1 — CalcService 파사드 통합 유닛테스트
// 못박는 계약: CRUD 계승·함수 SPI(override/확장)·구조편집 재작성→#REF+계보·순환경로 지목·
//   세대 토큰·캐시 직렬화(스테일 거부)·★증분==전체 오라클(불변식 2, REQ-T5-804).
// ============================================================
import { describe, it, expect } from 'vitest';
import { CalcService } from '../../../src/core/formula/CalcService.js';
import { registerExtendedFunctions } from '../../../src/core/formula/functions/extended/index.js';
import { OGDecimal } from '../../../src/core/OGDecimal.js';
import { cellKey, type CellValue } from '../../../src/core/formula/types.js';
import { MockGridAccessor } from './testAccessor.js';

function num(v: CellValue | unknown): string {
  return v instanceof OGDecimal ? v.toString() : String(v);
}

function makeService(g: MockGridAccessor) {
  // MockGridAccessor 는 FormulaGridAccessor 구현 → CalcHostPort(옵셔널 확장 미사용)로 충분.
  return new CalcService({
    host: g,
    setComputedValue: (rowId, field, value) => g.setValue(rowId, field, value),
  });
}

describe('CalcService — CRUD 계승(§2.1)', () => {
  it('setCellFormula 즉시 계산 + get/has/error', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('out'); g.addRow('r1', { a: 5 });
    const svc = makeService(g);
    svc.setCellFormula('r1', 'out', '=[a]*2');
    expect(num(g.getCellValue('r1', 'out'))).toBe('10');
    expect(svc.getCellFormula('r1', 'out')).toBe('=[a]*2');
    expect(svc.hasCellFormula('r1', 'out')).toBe(true);
    expect(svc.getCellError('r1', 'out')).toBeNull();
  });
});

describe('CalcService — 함수 SPI(§2.3): 확장/오버라이드', () => {
  it('svc.functions 로 확장 등록 후 평가에 반영', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b'); g.addColumn('out');
    g.addRow('r1', { a: 6, b: 2 });
    const svc = makeService(g);
    registerExtendedFunctions(svc.functions);
    svc.setCellFormula('r1', 'out', '=PRODUCT([a],[b])');
    expect(num(g.getCellValue('r1', 'out'))).toBe('12');
  });
});

describe('CalcService — 구조편집 재작성(§2.5)→#REF+계보(§2.6)', () => {
  it('deleteRows 로 참조 소멸 → #REF, provenance.brokenRefs 표기', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('out');
    for (const r of ['r1', 'r2', 'r3', 'r4', 'r5']) g.addRow(r, { a: 10 });
    const svc = makeService(g);
    svc.setCellFormula('r5', 'out', '=A3'); // A3 = 'a' 열, flat2 = r3
    expect(num(g.getCellValue('r5', 'out'))).toBe('10');

    const rep = svc.rewriteReferences({ op: 'deleteRows', at: 2, count: 1 }); // r3 삭제
    expect(rep.broken.length).toBe(1);
    expect(svc.getCellError('r5', 'out')).toBe('#REF');

    const prov = svc.getProvenance('r5', 'out');
    expect(prov.kind).toBe('error');
    expect(prov.error).toBe('#REF');
    expect(prov.brokenRefs?.length).toBe(1);
  });
});

describe('CalcService — 순환 경로 지목(§2.6, REQ-T8-803)', () => {
  it('p↔q 순환 → #CYCLE + getCyclePath 경로, 비순환은 null', () => {
    const g = new MockGridAccessor();
    g.addColumn('p'); g.addColumn('q'); g.addColumn('r'); g.addRow('r1', {});
    const svc = makeService(g);
    svc.setCellFormula('r1', 'p', '=[q]');
    svc.setCellFormula('r1', 'q', '=[p]'); // 순환 완성
    expect(svc.getCellError('r1', 'p')).toBe('#CYCLE');

    const path = svc.getCyclePath('r1', 'p');
    expect(path).not.toBeNull();
    expect(path).toContain(cellKey('r1', 'p'));
    expect(path).toContain(cellKey('r1', 'q'));

    svc.setCellFormula('r1', 'r', '=1+1'); // 비순환
    expect(svc.getCyclePath('r1', 'r')).toBeNull();
    const prov = svc.getProvenance('r1', 'p');
    expect(prov.kind).toBe('cycle');
    expect(prov.cyclePath).toBeDefined();
  });
});

describe('CalcService — 세대 토큰(§2.4)', () => {
  it('currentGeneration/invalidateGeneration 단조', () => {
    const g = new MockGridAccessor(); g.addColumn('a'); g.addRow('r1', { a: 1 });
    const svc = makeService(g);
    const g0 = svc.currentGeneration();
    const g1 = svc.invalidateGeneration();
    expect(g1).toBe(g0 + 1);
    expect(svc.currentGeneration()).toBe(g1);
  });
});

describe('CalcService — 캐시 직렬화(§2.7, REQ-T5-049/845)', () => {
  it('exportCache→importCache round-trip, 선행값 변경 시 스테일 거부', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('out'); g.addRow('r1', { a: 4 });
    const svc = makeService(g);
    svc.setCellFormula('r1', 'out', '=[a]*3'); // 12, precedent = r1:a=4
    const snap = svc.exportCache();
    expect(snap.entries.some((e) => e.key === cellKey('r1', 'out'))).toBe(true);

    // 동일 상태 재로드 → 검증 통과(캐시 신뢰).
    const svc2 = makeService(g);
    svc2.setCellFormula('r1', 'out', '=[a]*3');
    svc2.importCache(snap);
    expect(svc2.cache.get(cellKey('r1', 'out'))).toBeDefined();

    // 선행값 변경 후 재로드 → 해시 불일치 → 스테일 거부.
    const g3 = new MockGridAccessor();
    g3.addColumn('a'); g3.addColumn('out'); g3.addRow('r1', { a: 999 });
    const svc3 = makeService(g3);
    svc3.setCellFormula('r1', 'out', '=[a]*3');
    svc3.importCache(snap);
    expect(svc3.cache.get(cellKey('r1', 'out'))).toBeUndefined();
  });
});

describe('CalcService — ★증분==전체 오라클(불변식 2, REQ-T5-804)', () => {
  it('leaf 편집 후 증분 재계산 결과 == 전체 재계산 결과(셀 단위)', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b'); g.addColumn('c'); g.addColumn('d');
    g.addRow('r1', { a: 2 });
    const svc = makeService(g);
    // 체인: b=a*2, c=b+a, d=SUM(a,b,c)
    svc.setCellFormula('r1', 'b', '=[a]*2');
    svc.setCellFormula('r1', 'c', '=[b]+[a]');
    svc.setCellFormula('r1', 'd', '=SUM([a],[b],[c])');

    // leaf a 편집 → 증분 재계산.
    g.setValue('r1', 'a', 5);
    svc.onValuesChanged([cellKey('r1', 'a')]);
    const incremental = ['b', 'c', 'd'].map((f) => num(g.getCellValue('r1', f)));

    // 같은 상태에서 전체 재계산 → 동일해야 함.
    svc.recalculateAll();
    const full = ['b', 'c', 'd'].map((f) => num(g.getCellValue('r1', f)));

    expect(incremental).toEqual(full);
    // 손계산: a=5 → b=10, c=15, d=30.
    expect(full).toEqual(['10', '15', '30']);
  });
});
