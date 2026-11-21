// @vitest-environment node
/**
 * 걸음 C0b(SORT 몫) — DataLayer.structureVersion (DESIGN §5-나 C0b 줄 · §3-4 DataLayer 줄, PACT_C0b).
 * 행 집합·표시 순서가 바뀌는 일곱 곳에서만 +1, 값 변경으로는 그대로.
 * 자기시험(한 곳 빼면 빨강)은 같은 점검표로 steps/C0b/L40/tools/mutants.mjs 가 돌린다.
 */
import { describe, it, expect } from 'vitest';
import { DataLayer } from '../../src/core/DataLayer.js';
import { SV_CASES, structVerFailures } from './wg-helpers/structver-checks.js';

describe('C0b DataLayer.structureVersion', () => {
  it('U-SV-00~08 일곱 곳에서만 +1, 값 변경·읽기는 0', () => {
    expect(structVerFailures(DataLayer)).toEqual([]);
  });

  for (const c of SV_CASES) {
    it(`${c.id} ${c.what}`, () => {
      const dl = new DataLayer();
      dl.setData([{ id: 0, k: 'c', n: 3 }, { id: 1, k: 'a', n: 1 }, { id: 2, k: 'b', n: 2 }, { id: 3, k: 'a', n: 4 }]);
      const before = dl.structureVersion;
      c.run(dl);
      expect(dl.structureVersion - before).toBe(c.expectDelta);
    });
  }

  it('U-SV-09 단조 증가 — 무작위 조작 열 200번 뒤에도 내려가지 않고, 구조 조작 수와 같음', () => {
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const dl = new DataLayer();
    dl.setData(Array.from({ length: 30 }, (_, i) => ({ id: i, k: String.fromCharCode(97 + (i * 7) % 26), n: i % 5 })));
    let expected = dl.structureVersion;
    for (let t = 0; t < 200; t++) {
      const prev = dl.structureVersion;
      const op = Math.floor(rnd() * 6);
      const n = dl.rowCount;
      if (op === 0) { dl.applySort([{ field: rnd() < 0.5 ? 'k' : 'n', dir: rnd() < 0.5 ? 'asc' : 'desc' }]); expected++; }
      else if (op === 1) { dl.applyFilter(rnd() < 0.5 ? {} : { n: [{ operator: '>', value: 1 }] }); expected++; }
      else if (op === 2) { dl.addRow({ id: 100 + t, k: 'x', n: 1 }); expected++; }
      else if (op === 3 && n > 0) { dl.removeRow(Math.floor(rnd() * n)); expected++; }
      else if (op === 4 && n > 1) { dl.moveRow(0, n - 1); expected++; }
      else { dl.updateCell(0, 'k', 'v'); }
      expect(dl.structureVersion).toBeGreaterThanOrEqual(prev);
    }
    expect(dl.structureVersion).toBe(expected);
  });

  it('U-SV-10 정렬 결과 순서는 걸음 전과 같음(판 번호는 순서에 안 닿음)', () => {
    const dl = new DataLayer();
    dl.setData([{ id: 0, k: 'c' }, { id: 1, k: 'a' }, { id: 2, k: 'b' }]);
    dl.applySort([{ field: 'k', dir: 'asc' }]);
    expect(dl.getData().map((r: any) => r.id)).toEqual([1, 2, 0]);
  });
});
