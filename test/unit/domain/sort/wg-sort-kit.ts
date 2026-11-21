/**
 * 정렬 단위 시험 공용 준비(L28 · R1). 대조군은 test/unit/wg-helpers/legacy-controls.ts 의 사본(읽기만).
 * 새 정렬 클래스를 조립해 「옛 applySort 와 같은 입력」으로 돌리는 얇은 도우미만 둔다.
 */
import type { IRowSource, SortComparator, SortSpec } from '../../../../src/core/domain/sort/ports.js';
import { SortKeyStore } from '../../../../src/core/domain/sort/SortKeyStore.js';
import { ComparisonOrderer } from '../../../../src/core/domain/sort/ComparisonOrderer.js';
import { SyncSortRunner } from '../../../../src/core/domain/sort/SyncSortRunner.js';
import { Sorter } from '../../../../src/core/domain/sort/Sorter.js';
import { DEFAULT_SORT_COMPARATOR } from '../../../../src/core/domain/sort/SortKeyColumn.js';
import { SEEDS, type Gen } from '../../wg-helpers/sort-data.js';

/** 가짜 행 원천: 표시 순서를 바꿔 넣을 수 있음(「직전 표시 순서에서 출발」 재현). */
export class FakeRowSource implements IRowSource {
  order: number[];
  displayOrderCalls = 0;
  constructor(readonly rows: readonly any[], order?: number[]) {
    this.order = order ?? rows.map((_, i) => i);
  }
  displayOrder(): readonly number[] {
    this.displayOrderCalls++;
    return this.order;
  }
}

export function makeSorter(src: IRowSource): Sorter {
  return new Sorter(src, new SortKeyStore(src), [new ComparisonOrderer()], new SyncSortRunner());
}

/** 새 클래스로 한 번 정렬(키 열 → ComparisonOrderer). */
export function newOrder(rows: readonly any[], start: readonly number[], specs: readonly SortSpec[], cmp: SortComparator = DEFAULT_SORT_COMPARATOR): number[] {
  const src = new FakeRowSource(rows);
  const store = new SortKeyStore(src);
  const keys = specs.map(s => store.keyColumnFor(s, cmp));
  return Array.from(new ComparisonOrderer().order(start, keys, specs.map(s => s.dir)));
}

/**
 * 생성기 값 배열을 (생성기, 씨앗)마다 한 번만 만든다 — G10·G14 는 긴 글을 글자 단위로 이어 붙여 만들기만 수백 ms.
 * 값 배열은 읽기만 하므로 함께 써도 된다.
 */
const VALUES = new Map<string, any[]>();

/**
 * 빠른 판(기본)과 큰 판(`WG_SORT_FULL=1`). 걸음마다 도는 그물이 느리지 않게 기본은 씨앗 2개 · 생성기마다 앞 600행.
 * 생성기 14종(값 종류)은 그대로 다 돈다 — 잡는 힘은 값 종류에서 오고 행 수에서 오지 않음을 돌연변이로 확인(evidence_review).
 * 큰 판은 설계서 그대로(씨앗 8 · 생성기 행 수 전부).
 * 짓는 비용: G14 는 긴 글을 한 글자씩 이어 붙인 값이라 첫 비교에서 펴는 데 시간이 든다 — 빠른 판은 값을 미리 편다(글자는 같음).
 */
export const SORT_FULL = (globalThis as any).process?.env?.WG_SORT_FULL === '1';
export const SORT_SEEDS: readonly number[] = SORT_FULL ? SEEDS : [SEEDS[0], SEEDS[4]];
const FAST_ROWS = 600;
const flat = (x: any) => (typeof x === 'string' ? JSON.parse(JSON.stringify(x)) : x);

export function valuesOf(gen: Gen, seed: number): any[] {
  const k = `${gen.id}/${seed}`;
  let v = VALUES.get(k);
  if (!v) {
    v = gen.make(seed);
    if (!SORT_FULL) v = v.slice(0, FAST_ROWS).map(flat);
    VALUES.set(k, v);
  }
  return v;
}

export function sameArray(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** 씨앗 고정 순열(Fisher–Yates). */
export function permutation(n: number, rnd: () => number): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]!; p[i] = p[j]!; p[j] = t;
  }
  return p;
}

/** S-11·S-12 자료(기존 특성 테스트와 같은 값 — wg-sort-oracle ST-23 에 다시 적힌 것). */
export const GN = [
  { id: 0, g: 'B', n: 3 }, { id: 1, g: 'A', n: 1 }, { id: 2, g: 'B', n: 1 },
  { id: 3, g: 'A', n: 2 }, { id: 4, g: 'B', n: 2 }, { id: 5, g: 'A', n: 3 },
];
