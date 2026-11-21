/**
 * 넓은 그리드 새 그물 — DF-01 씨앗 고정 무작위 조작 열 (테스트 설계서 §4-1 DF-01 조작 꾸러미).
 *
 * T0 꾸러미(§4-1): scrollTop(무작위) · scrollLeft(무작위) · 대각선(같은 프레임에 둘 다) · 손잡이 끌기(±10~400px) ·
 * orderBy · 머리글 click · 행 click · 체크 · →/↓ 키 · Enter→글자→Enter 편집 · writeCell · setRangeSelection ·
 * setFilter · addRow(insertRow) · removeRow(deleteRow).
 * §17-4 의 더한 꾸러미(끄는 중 wheel·updateCell·mergeCells·디테일·groupBy·컬럼 숨김·크기 바꿈·테마·창 밖 포커스)는
 * C9 전 걸음 몫(TR-19) — 여기에는 아직 없다(NOTES.md 에 적음).
 *
 * 조작은 **바깥에서 하는 방식**(공개 API 또는 DOM 이벤트)으로만 한다. 조작 하나가 끝나면 flush(3 틱)를 부른다.
 * 같은 씨앗 → 같은 조작 열(난수는 mulberry32, Math.random 쓰지 않음).
 */
import type { OpenGrid } from '../../../src/core/OpenGrid.js';
import { tick } from './scenes.js';

/** 씨앗 난수(mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const OP_KINDS = [
  'scrollTop', 'scrollLeft', 'diagonal', 'dragHandle', 'orderBy', 'headerClick', 'rowClick',
  'check', 'arrowKey', 'edit', 'writeCell', 'setRangeSelection', 'setFilter', 'addRow', 'removeRow',
] as const;
export type OpKind = typeof OP_KINDS[number];

export interface Op { kind: OpKind; a: number; b: number; c: number; d: number }

/** 씨앗 하나로 n 개의 조작 기술(무엇을·어떤 난수로)을 만든다. 실제 대상은 실행 때 그 화면에서 고른다. */
export function genOps(seed: number, n: number): Op[] {
  const rnd = mulberry32(seed);
  const ops: Op[] = [];
  for (let i = 0; i < n; i++) {
    const kind = OP_KINDS[Math.floor(rnd() * OP_KINDS.length)]!;
    ops.push({ kind, a: rnd(), b: rnd(), c: rnd(), d: rnd() });
  }
  return ops;
}

function pick<T>(arr: T[], r: number): T | undefined {
  return arr.length ? arr[Math.min(arr.length - 1, Math.floor(r * arr.length))] : undefined;
}

function fire(target: EventTarget, type: string, init: Record<string, any> = {}): void {
  const Ctor = type.startsWith('key') ? KeyboardEvent : MouseEvent;
  target.dispatchEvent(new (Ctor as any)(type, { bubbles: true, cancelable: true, ...init }));
}

export interface OpContext { grid: OpenGrid<any>; container: HTMLElement; fields: string[] }

/** 조작 하나를 실행하고 flush. 돌려주는 글은 기록용(실패 메시지에 앞선 조작 열로 나옴). */
export async function runOp(ctx: OpContext, op: Op): Promise<string> {
  const { grid, container, fields } = ctx;
  const g = grid as any;
  const bw = container.querySelector<HTMLElement>('.og-body-wrapper')!;
  const body = container.querySelector<HTMLElement>('.og-body')!;
  const rowsEls = () => Array.from(body.querySelectorAll<HTMLElement>('.og-row'));
  const cellsOf = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>('[role="gridcell"]'));
  const bodyH = parseFloat(body.style.height || '0') || 0;
  const bodyW = parseFloat(body.style.minWidth || '0') || 0;
  let desc: string = op.kind;

  switch (op.kind) {
    case 'scrollTop': {
      bw.scrollTop = Math.floor(op.a * Math.max(0, bodyH - 600));
      fire(bw, 'scroll');
      desc += ` ${bw.scrollTop}`;
      break;
    }
    case 'scrollLeft': {
      bw.scrollLeft = Math.floor(op.a * Math.max(0, bodyW - 1200));
      fire(bw, 'scroll');
      desc += ` ${bw.scrollLeft}`;
      break;
    }
    case 'diagonal': {
      bw.scrollTop = Math.floor(op.a * Math.max(0, bodyH - 600));
      bw.scrollLeft = Math.floor(op.b * Math.max(0, bodyW - 1200));
      fire(bw, 'scroll');
      desc += ` ${bw.scrollLeft},${bw.scrollTop}`;
      break;
    }
    case 'dragHandle': {
      const handles = Array.from(container.querySelectorAll<HTMLElement>('th.og-header-cell .og-resize-handle'));
      const h = pick(handles, op.a);
      if (!h) { desc += ' (손잡이 없음)'; break; }
      const dx = Math.round((op.b < 0.5 ? -1 : 1) * (10 + op.c * 390));
      fire(h, 'mousedown', { clientX: 500 });
      fire(document, 'mousemove', { clientX: 500 + Math.round(dx / 2) });
      fire(document, 'mousemove', { clientX: 500 + dx });
      fire(document, 'mouseup', { clientX: 500 + dx });
      desc += ` #${handles.indexOf(h)} ${dx}`;
      break;
    }
    case 'orderBy': {
      const f = pick(fields, op.a)!;
      const dir = op.b < 0.5 ? 'asc' : 'desc';
      grid.orderBy(f, dir);
      desc += ` ${f} ${dir}`;
      break;
    }
    case 'headerClick': {
      const ths = Array.from(container.querySelectorAll<HTMLElement>('th.og-header-cell.og-sortable'));
      const th = pick(ths, op.a);
      if (!th) { desc += ' (머리글 없음)'; break; }
      fire(th, 'click', { shiftKey: op.b < 0.2 });
      desc += ` #${ths.indexOf(th)}${op.b < 0.2 ? ' shift' : ''}`;
      break;
    }
    case 'rowClick': {
      const row = pick(rowsEls(), op.a);
      const cell = row ? pick(cellsOf(row), op.b) : undefined;
      if (!cell) { desc += ' (칸 없음)'; break; }
      fire(cell, 'mousedown', { clientX: 10, clientY: 10 });
      fire(cell, 'mouseup', { clientX: 10, clientY: 10 });
      fire(cell, 'click', { clientX: 10, clientY: 10, ctrlKey: op.c < 0.15 });
      desc += ` r${row!.getAttribute('aria-rowindex')} c${cell.getAttribute('aria-colindex')}`;
      break;
    }
    case 'check': {
      const boxes = Array.from(body.querySelectorAll<HTMLInputElement>('.og-col-check input[type="checkbox"]'));
      const chk = pick(boxes, op.a);
      if (!chk) { desc += ' (체크 없음)'; break; }
      chk.checked = !chk.checked;
      fire(chk, 'change');
      desc += ` #${boxes.indexOf(chk)} ${chk.checked}`;
      break;
    }
    case 'arrowKey': {
      const k = op.a < 0.5 ? 'ArrowRight' : 'ArrowDown';
      const target = (document.activeElement && container.contains(document.activeElement)) ? document.activeElement : container;
      fire(target, 'keydown', { key: k });
      desc += ` ${k}`;
      break;
    }
    case 'edit': {
      const row = pick(rowsEls(), op.a);
      const cell = row ? pick(cellsOf(row), op.b) : undefined;
      if (!cell) { desc += ' (칸 없음)'; break; }
      fire(cell, 'click', { clientX: 10, clientY: 10 });
      await tick(1);
      const t = (document.activeElement && container.contains(document.activeElement)) ? document.activeElement : container;
      fire(t, 'keydown', { key: 'Enter' });
      await tick(1);
      const input = container.querySelector<HTMLInputElement>('.og-body input:not([type="checkbox"]), .og-body textarea, .og-cell-editor, input.og-editor');
      if (input && input !== document.querySelector('.og-find-input')) {
        input.value = `E${Math.floor(op.c * 1000)}`;
        fire(input, 'input');
        fire(input, 'keydown', { key: 'Enter' });
        desc += ` r${row!.getAttribute('aria-rowindex')} c${cell.getAttribute('aria-colindex')} =${input.value}`;
      } else {
        desc += ` r${row!.getAttribute('aria-rowindex')} c${cell.getAttribute('aria-colindex')} (편집기 안 열림)`;
      }
      break;
    }
    case 'writeCell': {
      const row = pick(rowsEls(), op.a);
      if (!row) { desc += ' (행 없음)'; break; }
      const ri = Number(row.getAttribute('aria-rowindex')) - 1;
      const f = pick(fields, op.b)!;
      grid.writeCell(ri, f, `W${Math.floor(op.c * 1000)}`);
      desc += ` ${ri} ${f}`;
      break;
    }
    case 'setRangeSelection': {
      const total = (grid.getData() as any[]).length;
      if (!total) { desc += ' (행 없음)'; break; }
      const r0 = Math.floor(op.a * total), r1 = Math.min(total - 1, r0 + Math.floor(op.b * 5));
      const c0 = Math.floor(op.c * fields.length), c1 = Math.min(fields.length - 1, c0 + Math.floor(op.d * 4));
      grid.setRangeSelection({ startRow: r0, endRow: r1, startCol: c0, endCol: c1 });
      desc += ` ${r0}-${r1} x ${c0}-${c1}`;
      break;
    }
    case 'setFilter': {
      const f = pick(fields, op.a)!;
      if (op.b < 0.5) {
        grid.setFilter(f, []);
        desc += ` ${f} 비움`;
      } else {
        const v = `r${Math.floor(op.c * 10)}`;
        grid.setFilter(f, [{ operator: 'contains', value: v } as any]);
        desc += ` ${f} contains ${v}`;
      }
      break;
    }
    case 'addRow': {
      const total = (grid.getData() as any[]).length;
      const pos = Math.floor(op.a * (total + 1));
      const item: Record<string, string> = {};
      fields.forEach((f, i) => { item[f] = `n${pos}c${i}`; });
      grid.insertRow(item, pos);
      desc += ` @${pos}`;
      break;
    }
    case 'removeRow': {
      const row = pick(rowsEls(), op.a);
      if (!row) { desc += ' (행 없음)'; break; }
      const ri = Number(row.getAttribute('aria-rowindex')) - 1;
      grid.deleteRow(ri);
      desc += ` ${ri}`;
      break;
    }
  }
  await tick(3);
  void g;
  return desc;
}
