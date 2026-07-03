import { describe, it, expect, vi, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

function makeContainer(id?: string): HTMLElement {
  const c = document.createElement('div');
  c.style.width  = '600px';
  c.style.height = '400px';
  if (id) c.id = id;
  document.body.appendChild(c);
  return c;
}

function makeGrid(container = makeContainer(), extra: Record<string, any> = {}) {
  return new OpenGrid(container, {
    columns: [
      { field: 'name',   header: '이름',  width: 150, editable: true },
      { field: 'dept',   header: '부서',  width: 120, editable: true },
      { field: 'salary', header: '급여',  width: 100, type: 'number', editable: false },
    ],
    height: 400,
    editable: true,
    ...extra,
  });
}

const sampleData = [
  { name: '홍길동', dept: '개발팀', salary: 5000000 },
  { name: '김철수', dept: '마케팅팀', salary: 4200000 },
  { name: '이영희', dept: '인사팀', salary: 3800000 },
];

// ─── ARIA 컨테이너 기본 속성 ───────────────────────────────
describe('Sprint 39 — ARIA 컨테이너 기본 속성', () => {
  it('role=grid 설정됨', () => {
    const c = makeContainer();
    makeGrid(c);
    expect(c.getAttribute('role')).toBe('grid');
  });

  it('aria-label 설정됨', () => {
    const c = makeContainer();
    makeGrid(c);
    expect(c.getAttribute('aria-label')).toBeTruthy();
  });

  it('aria-label 커스텀 값', () => {
    const c = makeContainer();
    makeGrid(c, { ariaLabel: '직원 목록 그리드' });
    expect(c.getAttribute('aria-label')).toBe('직원 목록 그리드');
  });

  it('aria-rowcount 초기값 0', () => {
    const c = makeContainer();
    makeGrid(c);
    expect(c.getAttribute('aria-rowcount')).toBe('0');
  });

  it('setData 후 aria-rowcount 갱신', () => {
    const c = makeContainer();
    const g = makeGrid(c);
    g.setData(sampleData);
    expect(c.getAttribute('aria-rowcount')).toBe('3');
  });

  it('aria-colcount 컬럼 수 반영', () => {
    const c = makeContainer();
    makeGrid(c);
    expect(c.getAttribute('aria-colcount')).toBe('3');
  });

  it('tabIndex=0 (키보드 접근 가능)', () => {
    const c = makeContainer();
    makeGrid(c);
    expect(c.tabIndex).toBe(0);
  });

  it('aria-live 알림 영역이 DOM에 존재함', () => {
    const c = makeContainer();
    makeGrid(c);
    expect(document.querySelector('.og-live-region')).not.toBeNull();
  });
});

// ─── 키보드 내비게이션 ─────────────────────────────────────
describe('Sprint 39 — 키보드 내비게이션', () => {
  it('ArrowDown → 다음 행 선택', () => {
    const c = makeContainer();
    const g = makeGrid(c);
    g.setData(sampleData);
    // 첫 이동: focusCell = (0,0)
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // 두 번째 이동: focusCell = (1,0)
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(g.getActiveRow()).toBe(1);
  });

  it('ArrowRight → 오른쪽 셀 이동 (선택 행 유지)', () => {
    const c = makeContainer();
    const g = makeGrid(c);
    g.setData(sampleData);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const rowBefore = g.getActiveRow();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(g.getActiveRow()).toBe(rowBefore); // 행은 동일
  });

  it('Home → 같은 행 첫 열 (행 변경 없음)', () => {
    const c = makeContainer();
    const g = makeGrid(c);
    g.setData(sampleData);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const rowBefore = g.getActiveRow();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(g.getActiveRow()).toBe(rowBefore); // 행은 유지, 열만 0으로
  });

  it('Ctrl+Home → 첫 행 이동', () => {
    const c = makeContainer();
    const g = makeGrid(c);
    g.setData(sampleData);
    // 2행으로 이동
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(g.getActiveRow()).toBe(1);
    // Ctrl+Home → 첫 행
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true }));
    expect(g.getActiveRow()).toBe(0);
  });

  it('Ctrl+End → 마지막 행 이동', () => {
    const c = makeContainer();
    const g = makeGrid(c);
    g.setData(sampleData);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }));
    expect(g.getActiveRow()).toBe(sampleData.length - 1);
  });

  it('PageDown → 여러 행 아래로 이동', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ name: `사원${i}`, dept: '개발', salary: i * 100 }));
    const c = makeContainer();
    const g = makeGrid(c, { pageSize: 5 });
    g.setData(data);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    expect(g.getActiveRow()).toBeGreaterThan(0);
  });
});

// ─── aria-live 알림 ────────────────────────────────────────
describe('Sprint 39 — aria-live 알림', () => {
  it('키보드 이동 후 aria-live 영역이 존재함', () => {
    const c = makeContainer();
    const g = makeGrid(c);
    g.setData(sampleData);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // aria-live region이 DOM에 있는지 확인 (내용은 setTimeout 50ms 후 설정됨)
    const liveRegion = document.querySelector('.og-live-region');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
  });
});

// ─── Phase 0(C8.1) — 공용 aria-live 리전 인프라 ─────────────
describe('Phase 0 — 공용 aria-live 리전(C8.1)', () => {
  it('그리드 컨테이너 내부(그리드 루트)에 부착된다', () => {
    const c = makeContainer();
    makeGrid(c);
    const region = c.querySelector('.og-live-region');
    expect(region).not.toBeNull();
    expect(c.contains(region)).toBe(true);
  });

  it('시각 숨김이 클래스가 아니라 인라인 스타일로 강제된다(호스트 CSS 격리)', () => {
    const c = makeContainer();
    makeGrid(c);
    const region = c.querySelector('.og-live-region') as HTMLElement;
    // 호스트 페이지가 .og-live-region 클래스 규칙을 깨뜨려도(예: 전역 리셋 CSS) 인라인
    // 스타일은 최고 특이도로 살아남는다 — baseline §Q5 하드 제약.
    expect(region.style.position).toBe('absolute');
    expect(region.style.width).toBe('1px');
    expect(region.style.height).toBe('1px');
    expect(region.style.overflow).toBe('hidden');
  });

  it('announce() 로 표면화된 메시지가 리전 텍스트에 반영된다(writeCells skip 경유)', async () => {
    vi.useFakeTimers();
    try {
      const c = makeContainer();
      const g = makeGrid(c);
      g.setData(sampleData);
      g.groupBy(['dept']); // 부서 3종 전부 유니크 → 전부 접힌 그룹 헤더만 존재(flat index 0 = group)

      g.writeCells([{ rowIndex: 0, field: 'salary', value: 1 }]); // group 헤더 대상 → skip → announce

      vi.advanceTimersByTime(60); // _announce 는 50ms 뒤 textContent 를 채운다
      const region = c.querySelector('.og-live-region') as HTMLElement;
      expect(region.textContent).toContain('건너뛰');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── setFilterSelect API ────────────────────────────────────
describe('Sprint 39 — setFilterSelect API', () => {
  it('setFilterSelect(config) 호출 시 패널이 컨테이너에 삽입됨', () => {
    const c = makeContainer('fs-grid');
    const g = makeGrid(c);
    g.setFilterSelect({
      columns: [{ field: 'dept', label: '부서', options: [{ value: '개발팀', text: '개발팀' }] }],
    });
    expect(c.querySelector('.og-filter-select')).not.toBeNull();
  });

  it('setFilterSelect(null) 호출 시 패널 제거됨', () => {
    const c = makeContainer('fs-grid2');
    const g = makeGrid(c);
    g.setFilterSelect({ columns: [{ field: 'dept', label: '부서' }] });
    expect(c.querySelector('.og-filter-select')).not.toBeNull();
    g.setFilterSelect(null);
    expect(c.querySelector('.og-filter-select')).toBeNull();
  });
});

// ─── destroy ───────────────────────────────────────────────
describe('Sprint 39 — destroy', () => {
  it('destroy() 후 컨테이너 내 그리드 클래스 확인', () => {
    const c = makeContainer();
    const g = makeGrid(c);
    g.destroy();
    // 컨테이너가 남아 있는지 확인
    expect(document.body.contains(c)).toBe(true);
  });
});
