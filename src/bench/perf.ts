/**
 * OPEN_GRID 성능 벤치마크
 * / OPEN_GRID performance benchmark.
 *
 * 브라우저 콘솔 또는 Node 환경에서 실행:
 *   npx vite-node src/bench/perf.ts
 * / Run in the browser console or a Node environment:
 *   npx vite-node src/bench/perf.ts
 *
 * 측정 항목: / Measured items:
 *  - 10만 행 데이터 생성 시간 / Time to generate 100k rows
 *  - DataLayer.setData() 시간 / DataLayer.setData() time
 *  - DataLayer.applySort() 시간 / DataLayer.applySort() time
 *  - DataLayer.applyFilter() 시간 / DataLayer.applyFilter() time
 *  - buildGroups() 시간 / buildGroups() time
 *  - buildTree() 시간 / buildTree() time
 *  - MergeEngine.applyAutoMerge() 시간 / MergeEngine.applyAutoMerge() time
 *
 * @internal 개발용 벤치 스크립트 — 공개 API 아님. / Dev-only benchmark script — not part of the public API.
 * @packageDocumentation
 */

import { DataLayer } from '../core/DataLayer.js';
import { buildGroups } from '../core/GroupEngine.js';
import { buildTree } from '../core/TreeEngine.js';
import { MergeEngine } from '../core/MergeEngine.js';

// ── 유틸 ────────────────────────────────────────────────── / utils

/**
 * fn 실행 시간을 측정해 콘솔에 찍고 결과를 그대로 반환. / Measure fn's run time, log it, and pass the result through.
 *
 * @param label - 측정 라벨 / Measurement label
 * @param fn - 측정할 함수 / Function to measure
 * @returns fn 의 반환값 / The return value of fn
 * @internal
 */
function time<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  const result = fn();
  const elapsed = (performance.now() - t0).toFixed(2);
  console.log(`  [BENCH] ${label}: ${elapsed}ms`);
  return result;
}

// ── 데이터 생성 ────────────────────────────────────────── / data generation
const NAMES    = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
const DEPTS    = ['Engineering', 'Marketing', 'HR', 'Finance', 'Operations'];
const PRODUCTS = ['Laptop', 'Phone', 'Tablet', 'Monitor', 'Keyboard'];

/**
 * 벤치용 합성 행을 n개 생성(약 30% 부모-자식 관계 포함). / Generate n synthetic rows for the bench (~30% parent-child relations).
 *
 * @param n - 생성할 행 수 / Number of rows to generate
 * @returns 합성 행 배열 / Array of synthetic rows
 * @internal
 */
function generateRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    parentId: i > 0 && Math.random() < 0.3 ? Math.floor(Math.random() * i) : null,
    name: NAMES[i % 5]!,
    dept: DEPTS[i % 5]!,
    product: PRODUCTS[i % 5]!,
    qty: Math.floor(Math.random() * 1000),
    price: Math.floor(Math.random() * 1_000_000),
    date: new Date(2020 + (i % 5), i % 12, (i % 28) + 1).toISOString().slice(0, 10),
    active: i % 3 !== 0,
  }));
}

// ── 벤치마크 실행 ──────────────────────────────────────── / run the benchmark

/**
 * 지정 행 수로 전체 파이프라인(생성·정렬·필터·그룹·트리·병합·갱신)을 측정. / Measure the full pipeline (generate, sort, filter, group, tree, merge, update) at the given row count.
 *
 * @param rowCount - 벤치에 사용할 행 수 / Row count to benchmark
 * @internal
 */
async function runBench(rowCount: number) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  OPEN_GRID 벤치마크 (${rowCount.toLocaleString()} 행)`);
  console.log(`${'='.repeat(50)}`);

  // 1. 데이터 생성
  const rows = time(`데이터 생성 (${rowCount.toLocaleString()}행)`, () => generateRows(rowCount));

  // 2. DataLayer.setData
  const dl = new DataLayer('id');
  time('DataLayer.setData()', () => dl.setData(rows));
  console.log(`     → rowCount: ${dl.rowCount.toLocaleString()}`);

  // 3. applySort (단일 필드)
  time('applySort (price desc)', () => dl.applySort([{ field: 'price', dir: 'desc' }]));

  // 4. applySort (멀티소트)
  time('applySort (dept asc, price desc)', () => dl.applySort([
    { field: 'dept', dir: 'asc' },
    { field: 'price', dir: 'desc' },
  ]));

  // 5. applyFilter
  time('applyFilter (qty >= 500)', () =>
    dl.applyFilter({ qty: [{ operator: '>=', value: 500 }] })
  );
  console.log(`     → 필터 후 rowCount: ${dl.rowCount.toLocaleString()}`);

  // 6. 필터 초기화 후 전체 복원
  dl.applyFilter({});
  console.log(`     → 필터 해제 후 rowCount: ${dl.rowCount.toLocaleString()}`);

  // 7. GroupEngine
  const data = dl.getData();
  time('buildGroups (dept)', () =>
    buildGroups(data, ['dept'])
  );
  time('buildGroups (dept + product)', () =>
    buildGroups(data, ['dept', 'product'], [{ field: 'price', op: 'SUM' }])
  );

  // 8. TreeEngine (부모-자식 비율 30% 기준)
  time('buildTree (id/parentId)', () =>
    buildTree(rows, { idField: 'id', parentIdField: 'parentId' })
  );

  // 9. MergeEngine 자동 병합
  const merge = new MergeEngine();
  const colData = data.slice(0, Math.min(10_000, data.length));
  time(`autoMerge dept (${colData.length.toLocaleString()}행)`, () =>
    merge.applyAutoMerge(colData, [0], ['dept'])
  );

  // 10. 대량 updateCell
  const updateCount = Math.min(1000, dl.rowCount);
  time(`updateCell x${updateCount}`, () => {
    for (let i = 0; i < updateCount; i++) {
      dl.updateCell(i, 'qty', i * 2);
    }
  });

  console.log(`\n  getChangedRows: ${dl.getChangedRows().length.toLocaleString()}건`);
  console.log();
}

// ── 단계별 실행 ────────────────────────────────────────── / staged execution
(async () => {
  await runBench(10_000);
  await runBench(100_000);
})();
