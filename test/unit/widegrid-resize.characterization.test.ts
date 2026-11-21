/**
 * [특성 테스트] 너비 조절 — jsdom 에서 잴 수 있는 「바깥 동작」만. 폭·위치는 jsdom 이 배치를 안 해 못 잰다
 * → test/e2e/widegrid-resize.spec.ts 가 맡는다.
 *
 * 잡으려는 깨짐: 손잡이 처리 방식을 바꾸다가(포인터 이벤트로 교체, 머리글 재사용 등)
 *  - resizable:false 컬럼에 손잡이가 생기거나, 보통 컬럼 손잡이가 사라짐
 *  - 손잡이를 누르거나 끌었더니 정렬이 일어남(sortChange·순서 변화)
 *  - 조절이 자료·선택·정렬 상태를 건드림
 *  - 조절한 폭을 공개 API 가 돌려주게 되었는데 문서가 안 바뀜(지금은 어디서도 안 돌려준다 — 기록용)
 *
 * 손잡이는 CSS 클래스 `.og-resize-handle` 로 찾는다. 테마·스킨이 쓰는 공개 CSS 이름이라 구조가 바뀌어도
 * 이 이름은 남아야 한다고 보고 썼다(바뀌면 이 파일 helper 한 곳만 고치면 된다).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installResizeObserverStub, makeGrid, settle, headerCellByText, mouse, pick } from './widegrid-helpers.js';

beforeAll(() => installResizeObserverStub());

const handleOf = (container: HTMLElement, header: string) =>
  headerCellByText(container, header).querySelector<HTMLElement>('.og-resize-handle');

function drag(handle: HTMLElement, dx: number) {
  mouse(handle, 'mousedown', { clientX: 100 });
  mouse(document, 'mousemove', { clientX: 100 + dx });
  mouse(document, 'mouseup', { clientX: 100 + dx });
}

const COLS = [
  { field: 'k', header: 'K', width: 100 },
  { field: 'v', header: 'V', width: 100, resizable: false },
  { field: 'w', header: 'W', width: 100 },
];
const DATA = [{ k: 'b', v: 1, w: 'x' }, { k: 'c', v: 2, w: 'y' }, { k: 'a', v: 3, w: 'z' }];

describe('너비 조절 손잡이(RU-01~RU-07)', () => {
  it('RU-01 보통 컬럼 머리글에는 손잡이가 있고 resizable:false 컬럼에는 없다', async () => {
    const { container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    expect(handleOf(container, 'K')).not.toBeNull();
    expect(handleOf(container, 'V')).toBeNull();
    expect(handleOf(container, 'W')).not.toBeNull();
  });

  it('RU-02 손잡이를 클릭해도 정렬되지 않는다(sortChange 0번, 순서 그대로)', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    let n = 0;
    grid.on('sortChange', () => n++);
    mouse(handleOf(container, 'K')!, 'click');
    expect(n).toBe(0);
    expect(pick(grid.getData(), 'k')).toEqual(['b', 'c', 'a']);
  });

  it('RU-03 손잡이를 끌어 놓아도 정렬·자료·선택이 그대로', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    grid.activate(1);
    let n = 0;
    grid.on('sortChange', () => n++);
    drag(handleOf(container, 'K')!, 60);
    await settle();
    expect(n).toBe(0);
    expect(pick(grid.getData(), 'k')).toEqual(['b', 'c', 'a']);
    expect(pick(grid.getSelections(), 'k')).toEqual(['c']);
  });

  it('RU-04 정렬된 상태에서 끌어 놓아도 정렬 순서·상태가 그대로', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    grid.orderBy('k', 'desc');
    drag(handleOf(container, 'W')!, 40);
    await settle();
    expect(pick(grid.getData(), 'k')).toEqual(['c', 'b', 'a']);
  });

  it('RU-05 끌어 놓은 뒤 머리글을 누르면 정상적으로 정렬된다(손잡이가 클릭을 삼키지 않음)', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    drag(handleOf(container, 'K')!, 30);
    await settle();
    mouse(headerCellByText(container, 'K'), 'click');
    expect(pick(grid.getData(), 'k')).toEqual(['a', 'b', 'c']);
  });

  it('RU-06 [이상해 보임] 조절한 폭은 공개 API 어디서도 안 보인다: getColumnDefs()[i].width 는 처음 값, calcColWidths() 는 빈 배열', async () => {
    const { grid, container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    drag(handleOf(container, 'K')!, 150);
    await settle();
    expect(grid.getColumnDefs()[0]!.width).toBe(100);
    expect(grid.calcColWidths()).toEqual([]);
  });

  it('RU-07 끌기 뒤 화면 칸 글자는 그대로(다시 그려도 내용 보존)', async () => {
    const { container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    drag(handleOf(container, 'K')!, 50);
    await settle();
    const t = container.querySelector('[role="row"][aria-rowindex="3"] [role="gridcell"][aria-colindex="3"]')?.textContent;
    expect(t).toBe('z');
  });
});
