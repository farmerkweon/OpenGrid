// @vitest-environment node
/**
 * U-CL-01 (걸음 C7, 테스트 설계서 §Q-03) — ColumnLayout.visibleLeaves 캐시.
 * - 같은 구성이면 같은 배열(같은 참조), 구성을 바꾸는 곳(생성·setColumns·addColumn·removeColumn·hideColumn·showColumn) 뒤에는 새 배열.
 * - 내용은 언제나 「숨김 아닌 잎을 차례대로」(캐시 없는 식)와 같다.
 * - setFrozen 은 표시 잎을 바꾸지 않으므로 같은 참조가 맞다.
 * 자기시험: WG_CL_PATH 로 무효화 한 줄을 뺀 ColumnLayout 사본을 가리키면 그 경우가 빨개진다
 *          (steps/C7/L25/tools/vl_selftest.mjs 가 무효화 세 자리를 하나씩 빼 돌림).
 */
import { describe, it, expect } from 'vitest';

const path = process.env.WG_CL_PATH ?? '../../src/core/ColumnLayout.js';
const { ColumnLayout } = await import(/* @vite-ignore */ path);

const cols = () => [
  { field: 'a', header: 'A' },
  { header: 'G', children: [{ field: 'b', header: 'B' }, { field: 'c', header: 'C' }] },
  { field: 'd', header: 'D' },
];
const plain = (cl: any) => cl.leaves.filter((c: any) => !c.hidden);
const fields = (arr: any[]) => arr.map((c: any) => c.field);

describe('U-CL-01 visibleLeaves 캐시', () => {
  it('U-CL-01 같은 구성이면 같은 배열(참조) · 내용 = 숨김 아닌 잎', () => {
    const cl = new ColumnLayout(cols());
    const a = cl.visibleLeaves;
    expect(cl.visibleLeaves).toBe(a);
    expect(fields(a)).toEqual(['a', 'b', 'c', 'd']);
    expect(fields(a)).toEqual(fields(plain(cl)));
  });

  it.each([
    ['hideColumn', (cl: any) => cl.hideColumn('b'), ['a', 'c', 'd']],
    ['showColumn', (cl: any) => { cl.hideColumn('b'); void cl.visibleLeaves; cl.showColumn('b'); }, ['a', 'b', 'c', 'd']],
    ['setColumns', (cl: any) => cl.setColumns([{ field: 'x', header: 'X' }, { field: 'a', header: 'A' }]), ['x', 'a']],
    ['addColumn', (cl: any) => cl.addColumn({ field: 'e', header: 'E' }), ['a', 'b', 'c', 'd', 'e']],
    ['removeColumn', (cl: any) => cl.removeColumn('d'), ['a', 'b', 'c']],
  ] as const)('U-CL-01 %s 뒤 새 배열 · 내용 맞음', (_name, act, want) => {
    const cl = new ColumnLayout(cols());
    const before = cl.visibleLeaves;
    act(cl);
    const after = cl.visibleLeaves;
    expect(after).not.toBe(before);
    expect(fields(after)).toEqual(want);
    expect(fields(after)).toEqual(fields(plain(cl)));
    expect(cl.visibleLeaves).toBe(after);
  });

  it('U-CL-01 setFrozen 은 표시 잎을 안 바꾸므로 같은 참조', () => {
    const cl = new ColumnLayout(cols());
    const a = cl.visibleLeaves;
    cl.setFrozen(2);
    expect(cl.visibleLeaves).toBe(a);
    expect(cl.frozenCount).toBe(2);
  });

  it('U-CL-01 숨김→보임을 여러 번 섞어도 늘 캐시 없는 식과 같다', () => {
    const cl = new ColumnLayout(cols());
    const ops: Array<(c: any) => void> = [
      c => c.hideColumn(['a', 'c']), c => c.showColumn('a'), c => c.hideColumn('d'),
      c => c.addColumn({ field: 'z', header: 'Z' }, 1), c => c.showColumn(['c', 'd']), c => c.removeColumn('b'),
    ];
    for (const op of ops) {
      op(cl);
      expect(fields(cl.visibleLeaves)).toEqual(fields(plain(cl)));
    }
  });
});
