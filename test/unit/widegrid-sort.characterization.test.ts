/**
 * [특성 테스트] 정렬 — 지금 코드의 정렬 결과 순서를 「값 그대로」 못 박는다.
 *
 * 잡으려는 깨짐: 정렬 구현을 빠르게 바꾸다가(비교 함수 교체, localeCompare 도입, Intl.Collator,
 * 원본 순서에서 다시 정렬, 키 캐시 등) 결과 순서가 한 칸이라도 달라지는 것.
 * 지금 동작이 이상해 보여도 고치지 않고 그대로 못 박는다(설계서 TEST_DESIGN.md §5 「이상해 보이는 것」).
 *
 * 관찰 수단: grid.getData()(표시 순서), sortChange 이벤트, 머리글 클릭(공개 UI), getSelections().
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installResizeObserverStub, makeGrid, settle, headerCellByText, mouse, pick } from './widegrid-helpers.js';

beforeAll(() => installResizeObserverStub());

const keyCols = [{ field: 'k', header: 'K' }, { field: 'id', header: 'ID' }];

function sortedIds(data: any[], dir: 'asc' | 'desc', extra: Record<string, any> = {}): number[] {
  const { grid } = makeGrid({ columns: keyCols, sortable: true, ...extra }, data);
  grid.orderBy('k', dir);
  return pick(grid.getData(), 'id');
}

// 섞인 값: 한글·영문 대소문자·빈 문자열·null·undefined·숫자형 문자열·숫자
const MIXED = [
  { id: 0, k: '나' }, { id: 1, k: 'b' }, { id: 2, k: 'A' }, { id: 3, k: '가' },
  { id: 4, k: '' }, { id: 5, k: null }, { id: 6, k: undefined }, { id: 7, k: '10' },
  { id: 8, k: '9' }, { id: 9, k: 10 }, { id: 10, k: 9 }, { id: 11, k: 'a' },
];

describe('정렬 결과 순서 — 섞인 자료(S-01~S-03)', () => {
  it('S-01 오름차순: null/undefined 가 맨 앞, 그다음 빈 문자열, 그 뒤는 문자열 코드값 순(숫자도 문자열로 비교)', () => {
    expect(sortedIds(MIXED, 'asc')).toEqual([5, 6, 4, 7, 9, 8, 10, 2, 11, 1, 3, 0]);
  });

  it('S-02 내림차순: 오름차순을 뒤집되 같은 값끼리는 원래 순서를 유지(null/undefined 는 맨 뒤)', () => {
    expect(sortedIds(MIXED, 'desc')).toEqual([0, 3, 1, 11, 2, 8, 10, 7, 9, 4, 5, 6]);
  });

  it('S-03 resetOrder() 뒤에는 처음 넣은 순서로 돌아간다', () => {
    const { grid } = makeGrid({ columns: keyCols, sortable: true }, MIXED);
    grid.orderBy('k', 'desc');
    grid.resetOrder();
    expect(pick(grid.getData(), 'id')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('정렬 결과 순서 — 숫자(S-04~S-06)', () => {
  const NUMS = [
    { id: 0, k: 10 }, { id: 1, k: -1 }, { id: 2, k: 2.5 }, { id: 3, k: 0 },
    { id: 4, k: 100 }, { id: 5, k: null }, { id: 6, k: -20 }, { id: 7, k: 2.5 },
  ];
  it('S-04 숫자 오름차순은 수의 크기 순(null 맨 앞), 같은 값은 원래 순서', () => {
    expect(sortedIds(NUMS, 'asc')).toEqual([5, 6, 1, 3, 2, 7, 0, 4]);
  });
  it('S-05 숫자 내림차순(null 맨 뒤), 같은 값은 원래 순서', () => {
    expect(sortedIds(NUMS, 'desc')).toEqual([4, 0, 2, 7, 3, 1, 6, 5]);
  });
  it('S-06 type:number 컬럼이라도 값이 문자열이면 문자열 비교다(「100」<「20」<「3」)', () => {
    const data = [{ id: 0, k: '3' }, { id: 1, k: '100' }, { id: 2, k: '20' }];
    const { grid } = makeGrid({ columns: [{ field: 'k', header: 'K', type: 'number' }, { field: 'id', header: 'ID' }], sortable: true }, data);
    grid.orderBy('k', 'asc');
    expect(pick(grid.getData(), 'id')).toEqual([1, 2, 0]);
  });
});

describe('정렬 결과 순서 — 한글(S-07)', () => {
  it('S-07 한글은 유니코드 코드값 순(자모 ㄱ 이 완성형 가 보다 앞, 영문 대문자 < 소문자 < 한글)', () => {
    const data = [
      { id: 0, k: '하늘' }, { id: 1, k: '가방' }, { id: 2, k: 'ㄱ' }, { id: 3, k: '가' },
      { id: 4, k: '갸' }, { id: 5, k: 'Zebra' }, { id: 6, k: 'apple' }, { id: 7, k: '가나다' },
    ];
    expect(sortedIds(data, 'asc')).toEqual([5, 6, 2, 3, 7, 1, 4, 0]);
  });
});

describe('정렬 결과 순서 — 날짜(S-08~S-09)', () => {
  it('S-08 ISO 날짜 문자열(YYYY-MM-DD)은 날짜 순으로 정렬된다', () => {
    const data = [{ id: 0, k: '2024-03-01' }, { id: 1, k: '2023-12-31' }, { id: 2, k: '2024-01-15' }, { id: 3, k: null }];
    const { grid } = makeGrid({ columns: [{ field: 'k', header: 'K', type: 'date' }, { field: 'id', header: 'ID' }], sortable: true }, data);
    grid.orderBy('k', 'asc');
    expect(pick(grid.getData(), 'id')).toEqual([3, 1, 2, 0]);
  });

  it('S-09 [이상해 보임] Date 객체는 String() 결과(요일 이름부터)로 비교된다 — 날짜 순이 아니다', () => {
    // 2024-01-05 = 금(Fri), 2023-06-01 = 목(Thu), 2024-01-01 = 월(Mon). 문자 순: Fri < Mon < Thu.
    const data = [
      { id: 0, k: new Date(2024, 0, 5) }, { id: 1, k: new Date(2023, 5, 1) },
      { id: 2, k: new Date(2024, 0, 1) }, { id: 3, k: null }, { id: 4, k: '2024-01-03' },
    ];
    const { grid } = makeGrid({ columns: [{ field: 'k', header: 'K', type: 'date' }, { field: 'id', header: 'ID' }], sortable: true }, data);
    grid.orderBy('k', 'asc');
    expect(pick(grid.getData(), 'id')).toEqual([3, 4, 0, 2, 1]);
  });
});

describe('같은 값끼리의 순서 — 안정성(S-10~S-11)', () => {
  const DATA = [
    { id: 0, g: 'B', n: 3 }, { id: 1, g: 'A', n: 1 }, { id: 2, g: 'B', n: 1 },
    { id: 3, g: 'A', n: 2 }, { id: 4, g: 'B', n: 2 }, { id: 5, g: 'A', n: 3 },
  ];
  const COLS = [{ field: 'g', header: 'G' }, { field: 'n', header: 'N' }, { field: 'id', header: 'ID' }];

  it('S-10 같은 값은 처음 넣은 순서를 유지한다(안정 정렬)', () => {
    const { grid } = makeGrid({ columns: COLS, sortable: true }, DATA);
    grid.orderBy('g', 'asc');
    expect(pick(grid.getData(), 'id')).toEqual([1, 3, 5, 0, 2, 4]);
  });

  it('S-11 단일 정렬을 다른 컬럼으로 바꾸면, 같은 값끼리는 「직전 표시 순서」를 따른다(원래 순서가 아님)', () => {
    const { grid } = makeGrid({ columns: COLS, sortable: true }, DATA);
    grid.orderBy('n', 'desc');                 // 표시: 0,5,3,4,1,2
    expect(pick(grid.getData(), 'id')).toEqual([0, 5, 3, 4, 1, 2]);
    grid.orderBy('g', 'asc');                  // 문자열 하나로 부르면 목록이 g 하나로 바뀜. 같은 g 안은 직전 순서
    expect(grid.getData().length).toBe(6);
    expect(pick(grid.getData(), 'id')).toEqual([5, 3, 1, 0, 4, 2]);
  });
});

describe('여러 컬럼 정렬(S-12~S-14)', () => {
  const DATA = [
    { id: 0, g: 'B', n: 3 }, { id: 1, g: 'A', n: 1 }, { id: 2, g: 'B', n: 1 },
    { id: 3, g: 'A', n: 2 }, { id: 4, g: 'B', n: 2 }, { id: 5, g: 'A', n: 3 },
  ];
  const COLS = [{ field: 'g', header: 'G' }, { field: 'n', header: 'N' }, { field: 'id', header: 'ID' }];

  it('S-12 orderBy(목록): 첫 키 오름 + 둘째 키 내림', () => {
    const { grid } = makeGrid({ columns: COLS, sortable: true, multiSort: true }, DATA);
    grid.orderBy([{ field: 'g', dir: 'asc' }, { field: 'n', dir: 'desc' }]);
    expect(pick(grid.getData(), 'id')).toEqual([5, 3, 1, 0, 4, 2]);
  });

  it('S-13 머리글 클릭 + Shift 클릭(multiSort:true)으로 두 키 정렬', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true, multiSort: true }, DATA);
    await settle();
    mouse(headerCellByText(container, 'G'), 'click');
    mouse(headerCellByText(container, 'N'), 'click', { shiftKey: true });
    expect(pick(grid.getData(), 'id')).toEqual([1, 3, 5, 2, 4, 0]);
  });

  it('S-14 multiSort 꺼짐: Shift 클릭이어도 앞 정렬을 버리고 새 컬럼 하나로 정렬', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true, multiSort: false }, DATA);
    await settle();
    const events: any[] = [];
    grid.on('sortChange', (e: any) => events.push(JSON.parse(JSON.stringify(e))));
    mouse(headerCellByText(container, 'G'), 'click');
    mouse(headerCellByText(container, 'N'), 'click', { shiftKey: true });
    expect(events[1].sortList).toEqual([{ field: 'n', dir: 'asc' }]);
    expect(pick(grid.getData(), 'id')).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it('S-14b multiSort 를 안 주면(기본값) Shift 클릭이 정렬 키를 쌓는다', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    mouse(headerCellByText(container, 'G'), 'click');
    mouse(headerCellByText(container, 'N'), 'click', { shiftKey: true });
    expect(pick(grid.getData(), 'id')).toEqual([1, 3, 5, 2, 4, 0]);
  });

  it('S-14c Shift 없이 다른 머리글을 누르면 앞 정렬은 버려진다(기본값에서도)', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const events: any[] = [];
    grid.on('sortChange', (e: any) => events.push(JSON.parse(JSON.stringify(e))));
    mouse(headerCellByText(container, 'G'), 'click');
    mouse(headerCellByText(container, 'N'), 'click');
    expect(events[1].sortList).toEqual([{ field: 'n', dir: 'asc' }]);
  });
});

describe('머리글 클릭 순환과 sortChange 이벤트(S-15~S-18)', () => {
  const DATA = [{ id: 0, k: 'b' }, { id: 1, k: 'c' }, { id: 2, k: 'a' }];

  it('S-15 같은 머리글을 세 번 누르면 오름 → 내림 → 해제(원래 순서)', async () => {
    const { grid, container } = makeGrid({ columns: keyCols, sortable: true }, DATA);
    await settle();
    const th = () => headerCellByText(container, 'K');
    mouse(th(), 'click');
    expect(pick(grid.getData(), 'id')).toEqual([2, 0, 1]);
    mouse(th(), 'click');
    expect(pick(grid.getData(), 'id')).toEqual([1, 0, 2]);
    mouse(th(), 'click');
    expect(pick(grid.getData(), 'id')).toEqual([0, 1, 2]);
  });

  it('S-16 sortChange 는 클릭마다 정확히 1번, 인자는 {field, dir, sortList} — 해제 때는 dir 이 없다', async () => {
    const { grid, container } = makeGrid({ columns: keyCols, sortable: true }, DATA);
    await settle();
    const events: any[] = [];
    grid.on('sortChange', (e: any) => events.push(JSON.parse(JSON.stringify(e))));
    for (let i = 0; i < 3; i++) mouse(headerCellByText(container, 'K'), 'click');
    expect(events).toEqual([
      { field: 'k', dir: 'asc', sortList: [{ field: 'k', dir: 'asc' }] },
      { field: 'k', dir: 'desc', sortList: [{ field: 'k', dir: 'desc' }] },
      { field: 'k', sortList: [] },
    ]);
  });

  it('S-17 onSortChange 옵션 콜백도 같은 인자로 1번씩 불린다', async () => {
    const calls: any[] = [];
    const { grid } = makeGrid({ columns: keyCols, sortable: true, onSortChange: (e: any) => calls.push(JSON.parse(JSON.stringify(e))) }, DATA);
    grid.orderBy('k', 'desc');
    expect(calls).toEqual([{ field: 'k', dir: 'desc', sortList: [{ field: 'k', dir: 'desc' }] }]);
  });

  it('S-18 정렬 없을 때 resetOrder() 는 sortChange 를 내지 않고, 정렬 중이면 {sortList:[]} 1번', () => {
    const { grid } = makeGrid({ columns: keyCols, sortable: true }, DATA);
    const events: any[] = [];
    grid.on('sortChange', (e: any) => events.push(JSON.parse(JSON.stringify(e))));
    grid.resetOrder();
    expect(events).toEqual([]);
    grid.orderBy('k', 'asc');
    grid.resetOrder();
    expect(events[1]).toEqual({ sortList: [] });
    expect(events.length).toBe(2);
  });

  it('S-19 sortable:false 이면 머리글을 눌러도 순서와 이벤트가 그대로', async () => {
    const { grid, container } = makeGrid({ columns: keyCols, sortable: false }, DATA);
    await settle();
    let n = 0;
    grid.on('sortChange', () => n++);
    mouse(headerCellByText(container, 'K'), 'click');
    expect(pick(grid.getData(), 'id')).toEqual([0, 1, 2]);
    expect(n).toBe(0);
  });
});

describe('정렬 뒤 화면·선택·체크·필터(S-20~S-24)', () => {
  const DATA = [{ id: 0, k: 'b' }, { id: 1, k: 'c' }, { id: 2, k: 'a' }];

  it('S-20 정렬 뒤 화면 첫 줄 칸 글자가 정렬 결과 첫 행 값이다', async () => {
    const { grid, container } = makeGrid({ columns: keyCols, sortable: true }, DATA);
    grid.orderBy('k', 'asc');
    await settle();
    const first = container.querySelector('[role="row"][aria-rowindex="1"] [role="gridcell"][aria-colindex="1"]');
    expect(first?.textContent).toBe('a');
  });

  it('S-21 [이상해 보임] 행 선택은 「몇 번째 줄」로 기억된다 — 정렬 뒤엔 같은 줄 번호의 다른 행이 선택된 것으로 나온다', () => {
    const { grid } = makeGrid({ columns: keyCols, sortable: true }, DATA);
    grid.activate(0); // 표시 0번 = id 0 ('b')
    const before = pick(grid.getSelections(), 'id');
    grid.orderBy('k', 'asc');
    const after = pick(grid.getSelections(), 'id');
    expect({ before, after }).toEqual({ before: [0], after: [2] });
  });

  it('S-22 [이상해 보임] 체크도 「몇 번째 줄」로 기억된다 — 정렬 뒤 getChecked 는 같은 줄 번호의 다른 행', () => {
    const { grid } = makeGrid({ columns: keyCols, sortable: true, checkColumn: true }, DATA);
    grid.checkByValue('k', ['b']); // id 0, 표시 0번
    const before = grid.getChecked().map(c => [c.rowIndex, c.row.id]);
    grid.orderBy('k', 'asc');
    const after = grid.getChecked().map(c => [c.rowIndex, c.row.id]);
    expect({ before, after }).toEqual({ before: [[0, 0]], after: [[0, 2]] });
  });

  it('S-23 [이상해 보임] 정렬 뒤 setFilter 를 걸면 정렬 순서가 풀린다(정렬 상태 목록은 남는다)', () => {
    const data = [{ id: 0, k: 'b', v: 1 }, { id: 1, k: 'c', v: 1 }, { id: 2, k: 'a', v: 1 }, { id: 3, k: 'd', v: 2 }];
    const { grid } = makeGrid({ columns: [...keyCols, { field: 'v', header: 'V' }], sortable: true }, data);
    const events: any[] = [];
    grid.on('sortChange', (e: any) => events.push(e));
    grid.orderBy('k', 'desc');
    expect(pick(grid.getData(), 'id')).toEqual([3, 1, 0, 2]);
    grid.setFilter('v', [{ operator: '=', value: 1 } as any]);
    expect(pick(grid.getData(), 'id')).toEqual([0, 1, 2]);
    expect(events.length).toBe(1);
  });

  it('S-24 정렬 결과는 원본 자료(getSourceRows)의 순서를 바꾸지 않는다', () => {
    const { grid } = makeGrid({ columns: keyCols, sortable: true }, DATA);
    grid.orderBy('k', 'asc');
    expect(pick(grid.getSourceRows(), 'id')).toEqual([0, 1, 2]);
  });
});

describe('3만 행 정렬 결과(S-25) — 큰 자료에서도 같은 규칙', () => {
  it('S-25 3만 행: 오름차순 결과가 같은 규칙(코드값·null 앞·안정)으로 계산한 기대와 정확히 같다', () => {
    const N = 30000;
    const words = ['가', '나', 'a', 'B', '', null, '10', '9'];
    const data = Array.from({ length: N }, (_, i) => ({ id: i, k: words[(i * 7919) % words.length] }));
    const { grid } = makeGrid({ columns: keyCols, sortable: true }, data);
    grid.orderBy('k', 'asc');
    const rank = (v: any) => (v == null ? -1 : 0);
    const expected = data.slice().sort((a, b) => {
      const ra = rank(a.k), rb = rank(b.k);
      if (ra !== rb) return ra - rb;
      if (a.k == null) return 0;
      const sa = String(a.k), sb = String(b.k);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }).map(r => r.id);
    expect(pick(grid.getData(), 'id')).toEqual(expected);
  });
});
