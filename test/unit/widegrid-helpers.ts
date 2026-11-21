/**
 * widegrid-* 특성 테스트 공용 도우미.
 *
 * 원칙: 구조(td 개수·style.width 문자열·내부 필드)가 아니라 「바깥에서 보이는 동작」만 본다.
 *  - 공개 API 반환값, 발행 이벤트와 인자, 클립보드에 쓰인 글자, 내려받기 파일 내용,
 *    ARIA 로 드러난 칸(role=gridcell / aria-colindex / aria-rowindex)의 글자.
 *  - 내부 private 메서드(_doRender 등)는 부르지 않는다. 구조가 바뀌어도 이 도우미는 그대로 써야 한다.
 *
 * jsdom 은 배치(layout)를 계산하지 않는다. 그래서 컨테이너의 getBoundingClientRect 만 크기를 준다
 * (기존 test/unit/header-wrap.test.ts 와 같은 방식). 폭·위치·스크롤 같은 배치 단언은 e2e 로 보낸다.
 */
import { vi } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';

export function installResizeObserverStub(): void {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/** 크기를 가진 컨테이너. jsdom 은 배치가 없어 getBoundingClientRect 만 흉내 낸다. */
export function makeContainer(width = 600, height = 400): HTMLElement {
  const c = document.createElement('div');
  c.style.width = `${width}px`;
  c.style.height = `${height}px`;
  c.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON() { return {}; },
  }) as DOMRect;
  document.body.appendChild(c);
  return c;
}

export function makeGrid<T extends Record<string, any> = any>(
  options: Record<string, any>,
  data?: T[],
  size: { width?: number; height?: number } = {},
): { grid: OpenGrid<T>; container: HTMLElement } {
  const container = makeContainer(size.width ?? 600, size.height ?? 400);
  const grid = new OpenGrid<T>(container, options as any);
  if (data) grid.setData(data);
  return { grid, container };
}

/** 그리기는 rAF 뒤로 미뤄질 수 있다 — 매크로태스크 두 번 + rAF 한 번을 기다린다. */
export async function settle(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => (globalThis.requestAnimationFrame ?? ((f: any) => setTimeout(f, 16)))(r as any));
  await new Promise(r => setTimeout(r, 0));
}

/** 화면에 그려진 칸 글자 — 접근성 표면(aria-rowindex 는 1부터, aria-colindex 는 데이터 컬럼 기준 1부터). */
export function visibleCellText(container: HTMLElement, rowIndex: number, colIndex: number): string | null {
  const row = container.querySelector(`[role="row"][aria-rowindex="${rowIndex + 1}"]`);
  if (!row) return null;
  const cell = row.querySelector(`[role="gridcell"][aria-colindex="${colIndex + 1}"]`);
  return cell ? (cell.textContent ?? '') : null;
}

/** 머리글 칸(잎 컬럼)을 보이는 글자로 찾는다. */
export function headerCellByText(container: HTMLElement, text: string): HTMLElement {
  const ths = Array.from(container.querySelectorAll<HTMLElement>('.og-header-cell'));
  const th = ths.find(t => (t.querySelector('span')?.textContent ?? '').trim() === text);
  if (!th) throw new Error(`header "${text}" not found`);
  return th;
}

export function installClipboardSpy(): { writes: string[] } {
  const writes: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn((t: string) => { writes.push(t); return Promise.resolve(); }),
      readText: vi.fn().mockResolvedValue(''),
    },
    configurable: true,
  });
  return { writes };
}

/** 내려받기(Blob URL)로 나가는 파일 글자를 가로챈다. 돌려준 restore() 를 꼭 부를 것. */
export function captureDownloads(): { files: Array<{ name: string; text: () => Promise<string> }>; restore: () => void } {
  const files: Array<{ name: string; text: () => Promise<string> }> = [];
  const blobs = new Map<string, Blob>();
  let n = 0;
  const origCreate = (URL as any).createObjectURL;
  const origRevoke = (URL as any).revokeObjectURL;
  (URL as any).createObjectURL = (b: Blob) => { const u = `blob:widegrid/${n++}`; blobs.set(u, b); return u; };
  (URL as any).revokeObjectURL = () => {};
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const b = blobs.get(this.href);
    if (b) {
      files.push({
        name: this.download,
        text: () => new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.readAsText(b);
        }),
      });
    }
  });
  return {
    files,
    restore: () => {
      (URL as any).createObjectURL = origCreate;
      (URL as any).revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    },
  };
}

export function key(target: HTMLElement, k: string, init: Partial<KeyboardEventInit> = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
}

export function mouse(target: EventTarget, type: string, init: Partial<MouseEventInit> = {}): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 넓은 자료: cols 개 컬럼(c0..c{n-1}), rows 개 행. 칸 값은 `r{행}c{열}`. */
export function wideColumns(cols: number, width = 120): Array<{ field: string; header: string; width: number }> {
  return Array.from({ length: cols }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width }));
}
export function wideRows(rows: number, cols: number): Array<Record<string, string>> {
  return Array.from({ length: rows }, (_, r) => {
    const o: Record<string, string> = {};
    for (let c = 0; c < cols; c++) o[`c${c}`] = `r${r}c${c}`;
    return o;
  });
}

/** getData() 결과에서 내부 행 id(_ogRowId 등)를 빼고 사용자 필드만 남긴다. */
export function pick<T extends Record<string, any>>(rows: T[], field: string): any[] {
  return rows.map(r => r[field]);
}
