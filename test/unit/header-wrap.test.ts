/**
 * [한계 명시] jsdom 은 레이아웃 미계산(offsetHeight=0)이라 헤더 높이 reflow
 * (측정→본문 축소)는 단위테스트로 검증 불가 — 실 렌더 e2e(Playwright)로 보강 대상.
 * 관련 e2e: test/e2e/auto-height.spec.ts 의 'headerWrap reflow' 케이스 참조.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

function makeContainer(): HTMLElement {
  const c = document.createElement('div');
  c.style.width  = '600px';
  c.style.height = '400px';
  // jsdom 은 getBoundingClientRect 가 0 을 반환 → 레이아웃이 건너뛰어진다. 강제로 크기를 부여.
  c.getBoundingClientRect = () => ({
    width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400, x: 0, y: 0,
    toJSON() { return {}; },
  }) as DOMRect;
  document.body.appendChild(c);
  return c;
}

// leaf 데이터 헤더 th 들만 반환 (extra 컬럼 제외)
function leafHeaderCells(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('.og-header-cell:not(.og-extra-col)')
  );
}

describe('헤더 줄바꿈(headerWrap / "\\n")', () => {
  it('headerWrap=true 인 th 는 white-space:normal, word-break:break-word', () => {
    const c = makeContainer();
    new OpenGrid(c, {
      columns: [
        { field: 'a', header: '짧은 헤더', width: 120 },
        { field: 'b', header: '아주 긴 헤더 텍스트 줄바꿈', width: 100, headerWrap: true },
      ],
    });
    const ths = leafHeaderCells(c);
    const wrapTh = ths[1]!;
    expect(wrapTh.style.whiteSpace).toBe('normal');
    expect(wrapTh.style.wordBreak).toBe('break-word');
    expect(wrapTh.style.overflow).toBe('visible');
  });

  it('headerWrap 미설정 th 는 기존 nowrap + ellipsis 유지(회귀 금지)', () => {
    const c = makeContainer();
    new OpenGrid(c, {
      columns: [
        { field: 'a', header: '일반 헤더', width: 120 },
        { field: 'b', header: '줄바꿈 헤더', width: 100, headerWrap: true },
      ],
    });
    const ths = leafHeaderCells(c);
    const plainTh = ths[0]!;
    expect(plainTh.style.whiteSpace).toBe('nowrap');
    expect(plainTh.style.overflow).toBe('hidden');
    expect(plainTh.style.textOverflow).toBe('ellipsis');
  });

  it('header 에 "\\n" 이 있으면 headerWrap 없이도 줄바꿈(br 삽입)되고 white-space:normal', () => {
    const c = makeContainer();
    new OpenGrid(c, {
      columns: [
        { field: 'a', header: '판매\n수량', width: 100 },
      ],
    });
    const th = leafHeaderCells(c)[0]!;
    expect(th.style.whiteSpace).toBe('normal');
    const label = th.querySelector('span')!;
    // 줄 사이에 <br> 가 삽입되어야 함
    expect(label.querySelectorAll('br').length).toBe(1);
    // 두 줄의 텍스트가 보존되어야 함
    expect(label.textContent).toContain('판매');
    expect(label.textContent).toContain('수량');
  });

  it('일반 헤더(줄바꿈 없음)는 label 에 br 이 없고 textContent 그대로', () => {
    const c = makeContainer();
    new OpenGrid(c, {
      columns: [
        { field: 'a', header: '제품명', width: 120 },
      ],
    });
    const th = leafHeaderCells(c)[0]!;
    const label = th.querySelector('span')!;
    expect(label.querySelectorAll('br').length).toBe(0);
    expect(label.textContent).toBe('제품명');
  });
});
