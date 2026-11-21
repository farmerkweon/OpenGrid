/**
 * 정렬 무작위 대조의 대조군 확인 — T0 (테스트 설계서 §0-4 · §2-10 DIFF-GEN · ST-23).
 *
 * T0 에서 증명할 것: 「지금 그리드의 정렬 결과 == 옛 비교자 사본(legacySortIndexes)으로 정렬한 결과」.
 * 이것이 초록이어야 뒤 걸음(C2·C3·C3b·C13…)이 새 정렬기를 이 사본과 대조할 수 있다.
 * 자기시험: 사본을 일부러 한 군데 틀리게 한 판에서는 대조가 빨개져야 한다(아니면 대조가 그물이 아님).
 *
 * 순서: setData → orderBy(f asc) [출발 = 넣은 순서] → orderBy(f desc) [출발 = 직전 표시 순서]
 *       → orderBy([g asc, f desc]) [출발 = 직전 표시 순서] → resetOrder [원래 순서].
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { installResizeObserverStub, makeGrid, pick } from './widegrid-helpers.js';
import { GENS, SEEDS, rowsOf } from './wg-helpers/sort-data.js';
import { legacySortCompare, legacySortIndexes, type LegacySortItem } from './wg-helpers/legacy-controls.js';

// 다른 레인이 같은 PC 에서 테스트·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다(C0 때 NR-05 가 두 번 시간 초과).
// 단언은 그대로 두고 시간 한도만 넉넉히. 더 긴 한도를 따로 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

// 증거 파일은 명시할 때만 쓴다(평소 실행이 T0 증거를 덮어쓰지 않게): WG_WRITE_EVIDENCE=1 또는 WG_T0_RECORD=1.
// 쓰는 곳은 WG_EVID_DIR(있으면) 아니면 T0 증거 폴더.
const WRITE_EVID = process.env.WG_WRITE_EVIDENCE === '1' || process.env.WG_T0_RECORD === '1';
const EVID = process.env.WG_EVID_DIR ? resolve(process.env.WG_EVID_DIR) : resolve(__dirname, '../../sessions/widegrid-perf-2026-11/steps/T0/L19/evidence');
const LOG: Record<string, any> = {};
beforeAll(() => installResizeObserverStub());
afterAll(() => {
  if (!WRITE_EVID) return;
  mkdirSync(EVID, { recursive: true });
  writeFileSync(resolve(EVID, 'sort-oracle.json'), JSON.stringify(LOG, null, 2), 'utf8');
});

type Cmp = (a: any, b: any, f: string, d: 'asc' | 'desc') => number;
interface Variant {
  name: string;
  cmp?: Cmp;
  /** 출발 순서를 바꾸는 망가뜨림(안정성·직전 순서 규칙) */
  start?: (prev: number[], n: number) => number[];
}

const STEPS: Array<{ label: string; list: LegacySortItem[] | null }> = [
  { label: 'f-asc', list: [{ field: 'f', dir: 'asc' }] },
  { label: 'f-desc', list: [{ field: 'f', dir: 'desc' }] },
  { label: 'g-asc+f-desc', list: [{ field: 'g', dir: 'asc' }, { field: 'f', dir: 'desc' }] },
  { label: 'reset', list: null },
];

/** 한 생성기·한 씨앗에서 그리드와 사본(변형)을 단계마다 대조. 어긋난 단계 이름 목록을 돌려준다. */
function compareOne(genIdx: number, seed: number, v: Variant): string[] {
  const gen = GENS[genIdx]!;
  const rows = rowsOf(gen.make(seed), seed);
  const { grid, container } = makeGrid({
    columns: [{ field: 'f', header: 'F' }, { field: 'g', header: 'G' }, { field: 'id', header: 'ID' }],
    sortable: true, multiSort: true,
  }, rows);
  const bad: string[] = [];
  let prev = rows.map((_, i) => i);
  for (const st of STEPS) {
    if (st.list) grid.orderBy(st.list as any);
    else grid.resetOrder();
    const got = pick(grid.getData(), 'id') as number[];
    const start = v.start ? v.start(prev, rows.length) : prev;
    const want = legacySortIndexes(rows, start, st.list ?? [], () => false, v.cmp ?? legacySortCompare).map(i => rows[i]!.id);
    if (got.length !== want.length || got.some((x, i) => x !== want[i])) bad.push(st.label);
    prev = st.list ? want : rows.map((_, i) => i);
  }
  grid.destroy();
  container.remove();
  return bad;
}

describe('정렬 대조군 = 지금 그리드 (G01~G14 × 씨앗 8)', () => {
  for (let gi = 0; gi < GENS.length; gi++) {
    const g = GENS[gi]!;
    it(`DIFF-GEN ${g.id} ${g.name} — 네 단계 모두 그리드 결과 == 옛 비교자 사본`, () => {
      const bads: Record<string, string[]> = {};
      for (const seed of SEEDS) {
        const b = compareOne(gi, seed, { name: 'legacy' });
        if (b.length) bads[String(seed)] = b;
      }
      LOG[`${g.id}`] = { rows: g.rows, seeds: SEEDS.length, mismatches: bads };
      expect(bads).toEqual({});
    }, 120000);
  }
});

describe('정렬 대조군 — 삭제 행(출발 = 표시 순서에서 삭제 행을 뺀 것)', () => {
  it('DIFF-REMOVED deleteRow 3개 뒤 정렬·여러 키·해제가 사본과 같다', () => {
    const rows = rowsOf(GENS[0]!.make(42), 42);
    const { grid, container } = makeGrid({
      columns: [{ field: 'f', header: 'F' }, { field: 'g', header: 'G' }, { field: 'id', header: 'ID' }],
      sortable: true, multiSort: true,
    }, rows);
    grid.orderBy('f', 'asc');
    // 지금 표시 순서 위치 10·20·30 의 행을 지운다(지금 코드는 지운 뒤 표시 순서를 원래 순서로 되돌린다 — 읽음 DataLayer.removeRow)
    const removedIds = new Set<number>();
    for (const pos of [30, 20, 10]) { removedIds.add((grid.getData()[pos] as any).id); (grid as any).deleteRow(pos); }
    const after = pick(grid.getData(), 'id') as number[];
    const isRemoved = (i: number) => removedIds.has(rows[i]!.id);
    LOG['DIFF-REMOVED'] = { removed: [...removedIds], afterDeleteFirst5: after.slice(0, 5), afterDeleteLen: after.length };
    let prev = after.slice(); // id == 원래 위치
    for (const st of STEPS) {
      if (st.list) grid.orderBy(st.list as any); else grid.resetOrder();
      const got = pick(grid.getData(), 'id');
      const want = legacySortIndexes(rows, prev, st.list ?? [], isRemoved);
      expect(got, st.label).toEqual(want);
      prev = st.list ? want : rows.map((_, i) => i).filter(i => !isRemoved(i));
    }
    grid.destroy();
    container.remove();
  });
});

describe('ST-23 사본 확인 — 기존 특성 테스트 S-01~S-12 의 기대 값(다시 적음, 그 파일 import 안 함)', () => {
  const run = (data: any[], list: LegacySortItem[], start?: number[]) =>
    legacySortIndexes(data, start ?? data.map((_, i) => i), list).map(i => data[i].id);
  const MIXED = [
    { id: 0, k: '나' }, { id: 1, k: 'b' }, { id: 2, k: 'A' }, { id: 3, k: '가' },
    { id: 4, k: '' }, { id: 5, k: null }, { id: 6, k: undefined }, { id: 7, k: '10' },
    { id: 8, k: '9' }, { id: 9, k: 10 }, { id: 10, k: 9 }, { id: 11, k: 'a' },
  ];
  const NUMS = [
    { id: 0, k: 10 }, { id: 1, k: -1 }, { id: 2, k: 2.5 }, { id: 3, k: 0 },
    { id: 4, k: 100 }, { id: 5, k: null }, { id: 6, k: -20 }, { id: 7, k: 2.5 },
  ];
  const GN = [
    { id: 0, g: 'B', n: 3 }, { id: 1, g: 'A', n: 1 }, { id: 2, g: 'B', n: 1 },
    { id: 3, g: 'A', n: 2 }, { id: 4, g: 'B', n: 2 }, { id: 5, g: 'A', n: 3 },
  ];
  it('ST-23 S-01 섞임 오름', () => expect(run(MIXED, [{ field: 'k', dir: 'asc' }])).toEqual([5, 6, 4, 7, 9, 8, 10, 2, 11, 1, 3, 0]));
  it('ST-23 S-02 섞임 내림', () => expect(run(MIXED, [{ field: 'k', dir: 'desc' }])).toEqual([0, 3, 1, 11, 2, 8, 10, 7, 9, 4, 5, 6]));
  it('ST-23 S-04 숫자 오름', () => expect(run(NUMS, [{ field: 'k', dir: 'asc' }])).toEqual([5, 6, 1, 3, 2, 7, 0, 4]));
  it('ST-23 S-05 숫자 내림', () => expect(run(NUMS, [{ field: 'k', dir: 'desc' }])).toEqual([4, 0, 2, 7, 3, 1, 6, 5]));
  it('ST-23 S-06 숫자 글자는 글자 비교', () => expect(run([{ id: 0, k: '3' }, { id: 1, k: '100' }, { id: 2, k: '20' }], [{ field: 'k', dir: 'asc' }])).toEqual([1, 2, 0]));
  it('ST-23 S-07 한글 코드값 순', () => expect(run([
    { id: 0, k: '하늘' }, { id: 1, k: '가방' }, { id: 2, k: 'ㄱ' }, { id: 3, k: '가' },
    { id: 4, k: '갸' }, { id: 5, k: 'Zebra' }, { id: 6, k: 'apple' }, { id: 7, k: '가나다' },
  ], [{ field: 'k', dir: 'asc' }])).toEqual([5, 6, 2, 3, 7, 1, 4, 0]));
  it('ST-23 S-08 ISO 날짜 글자', () => expect(run([{ id: 0, k: '2024-03-01' }, { id: 1, k: '2023-12-31' }, { id: 2, k: '2024-01-15' }, { id: 3, k: null }], [{ field: 'k', dir: 'asc' }])).toEqual([3, 1, 2, 0]));
  it('ST-23 S-09 Date 객체는 String() 순', () => expect(run([
    { id: 0, k: new Date(2024, 0, 5) }, { id: 1, k: new Date(2023, 5, 1) },
    { id: 2, k: new Date(2024, 0, 1) }, { id: 3, k: null }, { id: 4, k: '2024-01-03' },
  ], [{ field: 'k', dir: 'asc' }])).toEqual([3, 4, 0, 2, 1]));
  it('ST-23 S-10 안정', () => expect(run(GN, [{ field: 'g', dir: 'asc' }])).toEqual([1, 3, 5, 0, 2, 4]));
  it('ST-23 S-11 직전 표시 순서에서 출발', () => {
    const first = legacySortIndexes(GN, [0, 1, 2, 3, 4, 5], [{ field: 'n', dir: 'desc' }]);
    expect(first.map(i => GN[i]!.id)).toEqual([0, 5, 3, 4, 1, 2]);
    expect(run(GN, [{ field: 'g', dir: 'asc' }], first)).toEqual([5, 3, 1, 0, 4, 2]);
  });
  it('ST-23 S-12 여러 키(g 오름 + n 내림)', () => expect(run(GN, [{ field: 'g', dir: 'asc' }, { field: 'n', dir: 'desc' }])).toEqual([5, 3, 1, 0, 4, 2]));
});

describe('자기시험 — 일부러 틀린 사본에서는 대조가 빨개진다(초록이면 대조가 그물이 아님)', () => {
  /** 변형으로 모든 생성기 × 씨앗 앞 2개를 돌려, 어긋난 (생성기, 씨앗, 단계) 수를 센다. */
  function mismatches(v: Variant): number {
    let n = 0;
    const where: string[] = [];
    for (let gi = 0; gi < GENS.length; gi++) {
      for (const seed of SEEDS.slice(0, 2)) {
        const b = compareOne(gi, seed, v);
        n += b.length;
        if (b.length) where.push(`${GENS[gi]!.id}/${seed}:${b.join(',')}`);
      }
    }
    LOG[`selftest:${v.name}`] = { mismatches: n, where };
    return n;
  }
  const nullFlip: Cmp = (a, b, f, d) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;          // ← 뒤집음
    if (b == null) return -1;
    return legacySortCompare(a, b, f, d);
  };
  const locale: Cmp = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  };
  const allString: Cmp = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    const sa = String(a), sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  };

  it('자기시험 null 위치 뒤집기 → 어긋남 > 0', () => { expect(mismatches({ name: 'null-flip', cmp: nullFlip })).toBeGreaterThan(0); }, 300000);
  it('자기시험 안정성 깨기(같은 값의 출발 순서를 거꾸로) → 어긋남 > 0', () => { expect(mismatches({ name: 'unstable', start: p => p.slice().reverse() })).toBeGreaterThan(0); }, 300000);
  it('자기시험 「직전 표시 순서」 대신 「넣은 순서」에서 출발 → 어긋남 > 0', () => { expect(mismatches({ name: 'start-original', start: (_p, n) => Array.from({ length: n }, (_, i) => i) })).toBeGreaterThan(0); }, 300000);
  it('자기시험 localeCompare(ST-05 흉내) → 어긋남 > 0', () => { expect(mismatches({ name: 'localeCompare', cmp: locale })).toBeGreaterThan(0); }, 300000);
  it('자기시험 숫자도 글자로 비교 → 어긋남 > 0', () => { expect(mismatches({ name: 'all-string', cmp: allString })).toBeGreaterThan(0); }, 300000);
});
