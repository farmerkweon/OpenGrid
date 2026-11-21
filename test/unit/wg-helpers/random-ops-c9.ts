/**
 * DF-01 조작 꾸러미 — 걸음 C9(가로 가상화) 판. L19(TEST).
 * T0 꾸러미(random-ops.ts 의 15종 — 가로 스크롤·대각선·손잡이 끌기·정렬·필터·편집·포커스 화살표 …)를 **줄이지 않고** 그대로 쓰고,
 * 가로 창이 닿는 조작을 더한다(설계 C9 줄 · 테스트 설계서 §17-4 의 더한 꾸러미 중 컬럼 쪽):
 *   jumpToCol(공개 API) · 끝까지 가로 스크롤(창의 오른쪽 끝) · 컬럼 숨김 · 컬럼 보임 · 컬럼 이동(applyColumns 로 순서 바꿈) ·
 *   포커스 키(Home/End/Tab/ArrowLeft — 창 밖 칸으로 포커스가 가면 가로로 따라감).
 * 조작은 바깥에서 하는 방식(공개 API·DOM 이벤트)만. 같은 씨앗 → 같은 조작 열. 조작 하나 끝에 flush(3 틱).
 * 「공개 scrollToColumn」은 지금 API 에 없다(jumpToCol 이 그 자리 — 지금은 빈 몸). 그래서 끝까지 스크롤·포커스 키로 창을 옮기는 길을 덧붙였다.
 */
import { OP_KINDS, runOp, mulberry32, type Op, type OpContext } from './random-ops.js';
import { tick, cols } from './scenes.js';

export const C9_EXTRA_KINDS = ['jumpToCol', 'scrollRightEnd', 'hideColumn', 'showColumn', 'moveColumn', 'focusKey'] as const;
export const C9_OP_KINDS = [...OP_KINDS, ...C9_EXTRA_KINDS] as const;
export type C9OpKind = typeof C9_OP_KINDS[number];
export interface C9Op extends Omit<Op, 'kind'> { kind: C9OpKind }

/** 그리드마다 컬럼 순서·숨김을 기억(컬럼 이동이 숨김을 지우지 않게 다시 숨김). */
export interface C9OpContext extends OpContext { order: string[]; hidden: Set<string> }

export function c9Context(ctx: OpContext): C9OpContext {
  return { ...ctx, order: [...ctx.fields], hidden: new Set() };
}

export function genOpsC9(seed: number, n: number): C9Op[] {
  const rnd = mulberry32(seed * 7919 + 13);
  const ops: C9Op[] = [];
  for (let i = 0; i < n; i++) {
    const kind = C9_OP_KINDS[Math.floor(rnd() * C9_OP_KINDS.length)]!;
    ops.push({ kind, a: rnd(), b: rnd(), c: rnd(), d: rnd() });
  }
  return ops;
}

function pick<T>(arr: T[], r: number): T | undefined {
  return arr.length ? arr[Math.min(arr.length - 1, Math.floor(r * arr.length))] : undefined;
}

export async function runOpC9(ctx: C9OpContext, op: C9Op): Promise<string> {
  if ((OP_KINDS as readonly string[]).includes(op.kind)) return runOp(ctx, op as Op);
  const g = ctx.grid as any;
  const container = ctx.container;
  const bw = container.querySelector<HTMLElement>('.og-body-wrapper')!;
  let desc: string = op.kind;
  switch (op.kind) {
    case 'jumpToCol': {
      const f = pick(ctx.order, op.a)!;
      g.jumpToCol(f);
      desc += ` ${f}`;
      break;
    }
    case 'scrollRightEnd': {
      const body = container.querySelector<HTMLElement>('.og-body')!;
      const w = parseFloat(body.style.minWidth || '0') || 0;
      bw.scrollLeft = op.a < 0.5 ? Math.max(0, w - 1200) : 0;
      bw.dispatchEvent(new Event('scroll'));
      desc += ` ${bw.scrollLeft}`;
      break;
    }
    case 'hideColumn': {
      const shown = ctx.order.filter(f => !ctx.hidden.has(f));
      if (shown.length <= 5) { desc += ' (남은 컬럼 적음)'; break; }
      const f = pick(shown, op.a)!;
      g.hideColumn(f);
      ctx.hidden.add(f);
      desc += ` ${f}`;
      break;
    }
    case 'showColumn': {
      const hid = [...ctx.hidden];
      const f = pick(hid, op.a);
      if (!f) { desc += ' (숨은 컬럼 없음)'; break; }
      g.showColumn(f);
      ctx.hidden.delete(f);
      desc += ` ${f}`;
      break;
    }
    case 'moveColumn': {
      const from = Math.floor(op.a * ctx.order.length);
      const to = Math.floor(op.b * ctx.order.length);
      const [f] = ctx.order.splice(from, 1);
      ctx.order.splice(to, 0, f!);
      const defs = new Map(cols(ctx.fields.length).map(c => [c.field as string, c]));
      g.applyColumns(ctx.order.map(x => defs.get(x)!));
      if (ctx.hidden.size) g.hideColumn([...ctx.hidden]);
      desc += ` ${f} ${from}→${to}`;
      break;
    }
    case 'focusKey': {
      const keys = ['Home', 'End', 'Tab', 'ArrowLeft'];
      const k = pick(keys, op.a)!;
      const target = (document.activeElement && container.contains(document.activeElement)) ? document.activeElement : container;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      desc += ` ${k}`;
      break;
    }
  }
  await tick(3);
  return desc;
}
