/**
 * fallbackViewportHeight — 옵트인 뷰포트 안전장치.
 *
 * 배경(sessions/F4_SAMPLING_FIX.md): 호스트가 그리드 컨테이너 조상에 확정 높이를 주지 않으면
 * 내부 스페이서(totalRows×rowHeight)가 컨테이너를 전체 콘텐츠 크기로 부풀리고, ResizeObserver
 * 되먹임으로 windowing 이 무력화되어 전 행이 DOM 렌더되는 폭주가 발생한다. 이 옵션은 "언바운드"
 * (컨테이너가 전 콘텐츠를 다 담는) 상태에서만 윈도잉 뷰포트 높이를 폴백값으로 클램프해 폭주를 막는다.
 *
 * [테스트 전략] jsdom 은 레이아웃 미계산이라 getBoundingClientRect/offsetHeight 를 강제 부여한다.
 * (헤더 offsetHeight=0 → headerH = 기본 headerHeight 34px.)
 * 폭주 상태를 "실제 렌더"로 재현하면 jsdom 이 수만 DOM 행을 만들다 OOM 나므로, 마운트·setData 는
 * 작은 컨테이너(값싼 렌더)로 끝낸 뒤 컨테이너 높이만 언바운드 값으로 바꾸고 _syncHeaderLayout()를
 * 직접 호출한다. _syncHeaderLayout 은 뷰포트 높이만 설정(렌더는 rAF 로 예약, 테스트 중 미발화)하고,
 * getVisibleRange()는 순수 인덱스 계산이라 DOM 을 만들지 않는다 — 폭주 없이 윈도잉 결과를 검증한다.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
  // requestAnimationFrame 무력화: VirtualScroll.setViewportHeight 는 렌더를 rAF 로 예약한다.
  // 언바운드 시나리오에서 그 예약된 렌더가 나중에 발화하면 jsdom 이 수만 DOM 행을 만들다 OOM 난다.
  // 본 테스트는 동기 상태(_viewportHeight, getVisibleRange 순수 인덱스 계산)만 검증하므로
  // 예약 렌더가 실제로 발화할 필요가 없다 → rAF 를 no-op 로 막아 폭주 렌더를 원천 차단한다.
  (global as any).requestAnimationFrame = () => 0;
  (global as any).cancelAnimationFrame = () => {};
});

const ROW_HEIGHT = 32; // 기본값
const HEADER_H = 34;   // 기본 headerHeight (jsdom offsetHeight=0 → 이 값이 headerH 로 쓰임)

/** 높이를 런타임에 바꿀 수 있는 컨테이너(폭은 항상 600). 초기엔 작은 값이라 마운트 렌더가 값싸다. */
function makeContainer(): { el: HTMLElement; setHeight: (h: number) => void } {
  const c = document.createElement('div');
  let h = 400;
  c.getBoundingClientRect = () => ({
    width: 600, height: h, top: 0, left: 0, right: 600, bottom: h, x: 0, y: 0,
    toJSON() { return {}; },
  }) as DOMRect;
  document.body.appendChild(c);
  return { el: c, setHeight: (nh: number) => { h = nh; } };
}

/** 작은 컨테이너로 그리드 생성 + setData(값싼 초기 렌더). 이후 호출자가 높이를 바꿔 언바운드를 시뮬레이트. */
function makeGrid(el: HTMLElement, rows: number, extra: Record<string, any> = {}): OpenGrid {
  const grid = new OpenGrid(el, {
    columns: [
      { field: 'a', header: 'A', width: 120 },
      { field: 'b', header: 'B', width: 120 },
    ],
    ...extra,
  });
  const data = Array.from({ length: rows }, (_, i) => ({ a: i, b: i * 2 }));
  grid.setData(data as any);
  return grid;
}

function viewportHeight(grid: OpenGrid): number {
  return (grid as any)._vs._viewportHeight;
}

function visibleSpan(grid: OpenGrid): number {
  const r = (grid as any)._vs.getVisibleRange();
  return r.endIndex - r.startIndex + 1;
}

describe('fallbackViewportHeight (옵트인 뷰포트 안전장치)', () => {
  it('(a) 언바운드 + 대량행 + 옵션 ON → 뷰포트가 폴백으로 클램프되어 visibleCount 제한', () => {
    const ROWS = 100_000;
    const totalContent = ROWS * ROW_HEIGHT;                 // 3,200,000
    const { el, setHeight } = makeContainer();
    const grid = makeGrid(el, ROWS, { fallbackViewportHeight: 800 });

    setHeight(totalContent + HEADER_H);   // 스페이서에 맞춰 부푼 컨테이너(언바운드)
    (grid as any)._syncHeaderLayout();

    // 클램프 발동: 뷰포트 = 폴백값(800), 전체 부푼 높이가 아님
    expect(viewportHeight(grid)).toBe(800);
    // visibleCount ≈ ceil(800/32)=25 → 오버스캔 포함해도 수십 행. 전 행(10만)과 비교해 극소.
    expect(visibleSpan(grid)).toBeLessThan(100);
  });

  it('(b) 옵션 OFF(기본) → 기존 동작 불변(언바운드면 전 행 윈도잉)', () => {
    const ROWS = 100_000;
    const totalContent = ROWS * ROW_HEIGHT;
    const { el, setHeight } = makeContainer();
    const grid = makeGrid(el, ROWS); // fallbackViewportHeight 미지정 = OFF

    setHeight(totalContent + HEADER_H);
    (grid as any)._syncHeaderLayout();

    // 클램프 미발동: 부푼 뷰포트 높이 그대로 사용(=폭주 경로, 기존 동작 보존 증명)
    expect(viewportHeight(grid)).toBe(totalContent);
    // 윈도잉 범위가 사실상 전 행(getVisibleRange 는 순수 인덱스 계산 — DOM 미생성)
    const r = (grid as any)._vs.getVisibleRange();
    expect(r.endIndex).toBe(ROWS - 1);
  });

  it('(c) 바운드 컨테이너(측정<전체) + 옵션 ON → 클램프 미발동(측정값 사용)', () => {
    const ROWS = 100_000;
    const CONTAINER_H = 640; // 확정 높이 → 측정(606) < 전체(3.2M) → 바운드
    const { el, setHeight } = makeContainer();
    const grid = makeGrid(el, ROWS, { fallbackViewportHeight: 800 });

    setHeight(CONTAINER_H);
    (grid as any)._syncHeaderLayout();

    // 측정 뷰포트(640-34=606)를 그대로 사용해야 함(폴백 800 으로 대체되면 안 됨)
    expect(viewportHeight(grid)).toBe(CONTAINER_H - HEADER_H); // 606
    expect(visibleSpan(grid)).toBeLessThan(100);
  });

  it('(d) 소량행이 큰 컨테이너에 다 들어감 + 옵션 ON → 무해(측정<폴백이라 클램프 안 함, 전 행 유지)', () => {
    const ROWS = 5;                     // total = 160px << 컨테이너
    const { el, setHeight } = makeContainer();
    const grid = makeGrid(el, ROWS, { fallbackViewportHeight: 800 });

    setHeight(400);                     // vpHeight=366 >= 160(언바운드) 이지만 366 < 폴백 800
    (grid as any)._syncHeaderLayout();

    // vpHeight(366) <= fallback(800) 이라 클램프 미발동, 측정값 유지 — 어차피 전 5행 윈도잉(무해)
    expect(viewportHeight(grid)).toBe(366);
    const r = (grid as any)._vs.getVisibleRange();
    expect(r.endIndex).toBe(ROWS - 1);
  });
});
