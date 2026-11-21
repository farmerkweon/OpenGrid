/**
 * 걸음 C0b — DataLayer.structureVersion 이 오르는 일곱 곳 · 안 오르는 곳 점검표.
 * 시험(wg-sort-structver)과 자기시험(steps/C0b/L40/tools/mutants.mjs — 한 곳 뺀 사본)이 같은 점검표를 쓴다.
 * 돌려주는 값 = 어긋난 경우 이름 목록(빈 배열이면 통과).
 */
type DLCtor = new () => any;

const rows = () => [
  { id: 0, k: 'c', n: 3 }, { id: 1, k: 'a', n: 1 }, { id: 2, k: 'b', n: 2 }, { id: 3, k: 'a', n: 4 },
];

export interface SvCase { id: string; what: string; run: (dl: any) => void; expectDelta: number; }

export const SV_CASES: SvCase[] = [
  { id: 'U-SV-01', what: 'setData +1', run: dl => dl.setData(rows()), expectDelta: 1 },
  { id: 'U-SV-02', what: 'clearData +1', run: dl => dl.clearData(), expectDelta: 1 },
  { id: 'U-SV-03a', what: "addRow 'last' +1", run: dl => dl.addRow({ id: 9, k: 'z' }), expectDelta: 1 },
  { id: 'U-SV-03b', what: "addRow 'first' +1", run: dl => dl.addRow({ id: 9, k: 'z' }, 'first'), expectDelta: 1 },
  { id: 'U-SV-03c', what: 'addRow 숫자 위치 +1', run: dl => dl.addRow({ id: 9, k: 'z' }, 2), expectDelta: 1 },
  { id: 'U-SV-04a', what: 'removeRow +1', run: dl => dl.removeRow(1), expectDelta: 1 },
  { id: 'U-SV-04b', what: 'removeRow 범위 밖 0', run: dl => dl.removeRow(99), expectDelta: 0 },
  { id: 'U-SV-05a', what: 'moveRow +1', run: dl => dl.moveRow(0, 2), expectDelta: 1 },
  { id: 'U-SV-05b', what: 'moveRow 범위 밖 0', run: dl => dl.moveRow(0, 99), expectDelta: 0 },
  { id: 'U-SV-06a', what: 'applySort 정렬 +1(한 번 정렬에 1)', run: dl => dl.applySort([{ field: 'k', dir: 'asc' }]), expectDelta: 1 },
  { id: 'U-SV-06b', what: 'applySort 두 키 +1', run: dl => dl.applySort([{ field: 'k', dir: 'asc' }, { field: 'n', dir: 'desc' }]), expectDelta: 1 },
  { id: 'U-SV-06c', what: 'applySort 빈 목록(풀기) +1', run: dl => dl.applySort([]), expectDelta: 1 },
  { id: 'U-SV-07a', what: 'applyFilter +1', run: dl => dl.applyFilter({ k: [{ operator: '=', value: 'a' }] }), expectDelta: 1 },
  { id: 'U-SV-07b', what: 'applyFilter 빈 필터 +1(값 비교 안 함)', run: dl => dl.applyFilter({}), expectDelta: 1 },
  { id: 'U-SV-08a', what: 'updateCell 0', run: dl => dl.updateCell(0, 'k', 'q'), expectDelta: 0 },
  { id: 'U-SV-08b', what: '행 객체 직접 수정 0', run: dl => { dl.getRowByIndex(0).k = 'q'; }, expectDelta: 0 },
  { id: 'U-SV-08c', what: 'setFindFilter 0', run: dl => dl.setFindFilter('a', ['k']), expectDelta: 0 },
  { id: 'U-SV-08d', what: 'setComputedValueByRowId 0', run: dl => dl.setComputedValueByRowId(dl.getRowByIndex(0)._ogRowId, 'k', 'q'), expectDelta: 0 },
  { id: 'U-SV-08e', what: '읽기 메서드 0', run: dl => { dl.getData(); dl.rowCount; dl.getChanges(); dl.displayOrder(); dl.getCellValue(0, 'k'); }, expectDelta: 0 },
];

export function structVerFailures(DL: DLCtor): string[] {
  const bad: string[] = [];
  {
    const dl = new DL();
    if (dl.structureVersion !== 0) bad.push('U-SV-00 처음 값 0 아님');
  }
  for (const c of SV_CASES) {
    const dl = new DL();
    dl.setData(rows());
    const before = dl.structureVersion;
    c.run(dl);
    const d = dl.structureVersion - before;
    if (d !== c.expectDelta) bad.push(`${c.id} ${c.what}: 증가 ${d}`);
  }
  return bad;
}
