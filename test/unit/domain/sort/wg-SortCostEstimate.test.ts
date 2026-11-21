// @vitest-environment node
/**
 * U-EST-01~04 (걸음 R1) — TEST_DESIGN_NEW §2-18. 05~15(표본 공통 머리말·pickOrderer)는 C3b.
 * R1 에는 Number/String 키 열이 아직 없어(C2) 종류별 경우는 가짜 키 열(ISortKeyColumn)로 만든다 —
 * 추정은 kind 와 stringKeyAt 만 본다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SortCostEstimate } from '../../../../src/core/domain/sort/SortCostEstimate.js';
import type { ISortKeyColumn } from '../../../../src/core/domain/sort/ports.js';
import { mulberry32 } from '../../wg-helpers/sort-data.js';

const FACTS = JSON.parse(readFileSync(resolve(__dirname, '../../__golden__/wg/T0_FACTS.json'), 'utf8'));

function fakeKey(kind: ISortKeyColumn['kind'], keyAt: (i: number) => string | null = () => null): ISortKeyColumn {
  return { field: 'f', kind, cacheable: true, compare: () => 0, stringKeyAt: keyAt };
}

describe('U-EST SortCostEstimate (R1)', () => {
  it('U-EST-01 행 수 단조 — 1,000 < 100,000 (종류마다)', () => {
    for (const kind of ['number', 'string', 'general', 'ranked'] as const) {
      const key = fakeKey(kind, () => (kind === 'string' ? 'abcdefghij' : null));
      expect(SortCostEstimate.of(1000, [key], false).expectedMs).toBeLessThan(SortCostEstimate.of(100000, [key], false).expectedMs);
    }
    expect(SortCostEstimate.of(0, [fakeKey('general')], false).expectedMs).toBe(0);
    expect(SortCostEstimate.of(1, [fakeKey('general')], false).expectedMs).toBe(0);
  });

  it('U-EST-02 나눔 판정 — 10만 행 4,000자 string → true / 1,000 행 number → false', () => {
    const long = 'x'.repeat(3900);
    const r = mulberry32(1);
    const tails = Array.from({ length: 256 }, () => Math.floor(r() * 1e12).toString(36).padEnd(100, 'q'));
    const strKey = fakeKey('string', i => long + tails[i % 256]);
    expect(SortCostEstimate.of(100000, [strKey], false).prefersSlicing(100)).toBe(true);
    expect(SortCostEstimate.of(1000, [fakeKey('number')], false).prefersSlicing(100)).toBe(false);
    // 문턱 기본값 = 100
    expect(SortCostEstimate.of(100000, [strKey], false).prefersSlicing()).toBe(true);
    expect(SortCostEstimate.of(1000, [fakeKey('number')], false).prefersSlicing()).toBe(false);
    // 경계: 문턱과 꼭 같으면 나누지 않음(「넘으면」 — 검토 돌연변이 「> → >=」)
    const e = SortCostEstimate.of(100000, [strKey], false);
    expect(e.prefersSlicing(e.expectedMs)).toBe(false);
    expect(e.prefersSlicing(e.expectedMs - 1e-6)).toBe(true);
  });

  it('U-EST-03 종류 가중치 — n=10만: general > string > number(엄격) · prefersSlicing(100) 이 T0 실측 시간 순서와 어긋나지 않음', () => {
    const n = 100000;
    // T0(wg-nr-facts U-EST-03)이 잰 자료와 같은 모양: 글자 = 'k' + 36진 + 'x'×20
    const r = mulberry32(20261121);
    const strs = Array.from({ length: 1024 }, () => 'k' + Math.floor(r() * 1e9).toString(36) + 'x'.repeat(20));
    const est = {
      number: SortCostEstimate.of(n, [fakeKey('number')], false),
      string: SortCostEstimate.of(n, [fakeKey('string', i => strs[i % strs.length]!)], false),
      general: SortCostEstimate.of(n, [fakeKey('general')], false),
    };
    expect(est.general.expectedMs).toBeGreaterThan(est.string.expectedMs);
    expect(est.string.expectedMs).toBeGreaterThan(est.number.expectedMs);
    // 실측(T0_FACTS.U-EST-03): 더 오래 걸린 종류가 나누지 않는데 더 빨리 끝난 종류만 나누는 일은 없어야 한다
    const measured = FACTS['U-EST-03'].value as Record<'number' | 'string' | 'general', number>;
    const kinds = ['number', 'string', 'general'] as const;
    for (const a of kinds) for (const b of kinds) {
      if (measured[a] > measured[b]) expect(!est[a].prefersSlicing(100) && est[b].prefersSlicing(100), `${a}(${measured[a]}ms) vs ${b}(${measured[b]}ms)`).toBe(false);
    }
  });

  it('U-EST-04 보관 등수 — fresh true 쪽 expectedMs 가 작음', () => {
    for (const kind of ['string', 'general'] as const) {
      const key = fakeKey(kind, () => (kind === 'string' ? 'y'.repeat(200) : null));
      expect(SortCostEstimate.of(100000, [key], true).expectedMs).toBeLessThan(SortCostEstimate.of(100000, [key], false).expectedMs);
    }
  });
});
