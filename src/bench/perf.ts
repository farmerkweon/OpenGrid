/**
 * OPEN_GRID 성능 벤치마크
 *
 * 브라우저 콘솔 또는 Node 환경에서 실행:
 *   npx vite-node src/bench/perf.ts
 *
 * 측정 항목:
 *  - 10만 행 데이터 생성 시간
 *  - DataLayer.setData() 시간
 *  - DataLayer.applySort() 시간
 *  - DataLayer.applyFilter() 시간
 *  - buildGroups() 시간
 *  - buildTree() 시간
 *  - MergeEngine.applyAutoMerge() 시간
 */

import { DataLayer } from '../core/DataLayer.js';
import { buildGroups } from '../core/GroupEngine.js';
import { buildTree } from '../core/TreeEngine.js';
import { MergeEngine } from '../core/MergeEngine.js';

// ── 유틸 ──────────────────────────────────────────────────
function time<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  const result = fn();
  const elapsed = (performance.now() - t0).toFixed(2);
  console.log(`  [BENCH] ${label}: ${elapsed}ms`);
  return result;
}

// ── 데이터 생성 ──────────────────────────────────────────
const NAMES    = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
const DEPTS    = ['Engineering', 'Marketing', 'HR', 'Finance', 'Operations'];
const PRODUCTS = ['Laptop', 'Phone', 'Tablet', 'Monitor', 'Keyboard'];

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

// ── 벤치마크 실행 ────────────────────────────────────────
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

// ── 단계별 실행 ──────────────────────────────────────────
(async () => {
  await runBench(10_000);
  await runBench(100_000);
})();
