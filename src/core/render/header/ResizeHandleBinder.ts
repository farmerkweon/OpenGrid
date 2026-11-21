import { ResizeGesture } from '../../domain/resize/ResizeGesture.js';
import { ResizeHitZone } from '../../domain/resize/ResizeHitZone.js';
import type { IResizeSink, ResizeBounds } from '../../domain/resize/ports.js';
import { RenderRequest } from '../../domain/render/RenderRequest.js';
import { Change } from '../../domain/render/ports.js';
import type { IColumnGeometry, IColumnWidthWriter } from '../../coordinate/geometryPorts.js';
import { leafColIndex } from '../../coordinate/types.js';
import type { IRenderScheduler } from '../ports.js';

/** 끌기 새 흐름에 필요한 협력자들(그리드가 한 번 넘겨 준다). / Collaborators of the live-resize flow. */
export interface ResizeBinderPorts {
  /** 폭 주인(날 배열과 기하에 같은 정수를 쓴다). / The width owner (same integer to raw widths and geometry). */
  readonly widths: IColumnWidthWriter;
  readonly scheduler: IRenderScheduler;
  readonly sink: IResizeSink;
  readonly geometry: IColumnGeometry;
}

/** 진행 중인 끌기 한 번(누를 때 하나 — 프레임마다 만들지 않음). */
interface DragSession {
  readonly ci: number;
  readonly th: HTMLElement;
  /** 포인터 사건으로 시작했으면 그 id(그때 합성 마우스 사건은 무시), 마우스면 null. */
  readonly pointerId: number | null;
  /** 마지막으로 폭 주인에게 쓴 폭. */
  lastWritten: number;
  readonly end: () => void;
}

/** 지금 끌기의 폭 한계 — 최소 40, 최대 없음(지금 그대로 — 컬럼 minWidth 는 안 읽음). */
const BOUNDS: ResizeBounds = { min: 40, max: Infinity };

/** 손잡이 영역 위에서 th 에 잠깐 쓰는 커서. */
const RESIZE_CURSOR = 'col-resize';

/**
 * 머리글 너비 손잡이의 DOM 이벤트(누름 → 끌기 → 놓기)를 맡는 객체.
 * 상태와 폭 계산은 헤드리스 상태 기계(`ResizeGesture`)가, 「이 점이 어느 컬럼의 손잡이인가」는 헤드리스 판정(`ResizeHitZone`)이 맡고,
 * 이 객체는 DOM 이벤트를 그리로 옮기기만 한다.
 * 손잡이를 놓은 뒤 따라오는 click 하나는 정렬로 넘기지 않는다(머리글 click 처리기가 `shouldSwallowClick` 으로 묻는다) —
 * 너비를 조절하고 손을 떼는 순간 머리글이 정렬돼 자료가 뒤섞이는 일을 막으려고.
 * 컬럼 경계 양쪽 몇 px 도 손잡이로 친다(경계 어느 쪽을 잡아도 경계 왼쪽 컬럼이 끌림). 그 자리는 요소·스타일시트 규칙을 더하지 않고
 * 머리글에 단 위임 듣개 하나가 포인터 자리를 판정해, 손잡이 영역이면 그 th 에 커서를 잠깐 쓰고 누르면 끌기를 시작한다.
 * 협력자(`connect`)를 받은 뒤로 끄는 동안에는 폭 주인에게 폭을 쓰고 스케줄러에 요청만 한다(DOM 은 스케줄러가 등록 자리에 씀) —
 * 놓을 때는 사용자 폭을 저장할 뿐 다시 그리지 않는다. 협력자가 없으면 끄는 동안 아무것도 안 쓰고 놓을 때 옛 `commit` 만 부른다.
 * 누름은 취소하지 않는다(포인터 누름을 취소하면 브라우저가 호환 마우스 사건을 페이지에 안 보낸다) — 글자 선택은 호환 mousedown 에서 막는다.
 *
 * Owns the DOM events of header width handles; state/width math live in the headless `ResizeGesture`, and which column a
 * point grips lives in the headless `ResizeHitZone`. The click that follows a release is swallowed so finishing a resize
 * never sorts the header. A few px on both sides of a column boundary also act as the grip: no element or stylesheet rule
 * is added — one delegated listener on the header classifies the pointer, sets the cursor on that th while it is over the
 * zone and starts the drag on press.
 */
export class ResizeHandleBinder {
  private readonly _gesture = new ResizeGesture();
  private readonly _zone = new ResizeHitZone();
  /** 끌 수 있는 잎 번호 → 그 잎의 th. 머리글을 다시 그릴 때 비운다. */
  private readonly _resizable = new Map<number, HTMLElement>();
  /** 끌 수 있는 잎의 필드 → 지금 판의 잎 번호(끄는 중 머리글이 다시 그려져 번호가 밀려도 같은 컬럼을 찾으려고). */
  private readonly _leafOfField = new Map<string, number>();
  /** 잎 th → 잎 번호(끌 수 없는 잎 포함 — 그 왼쪽 경계가 앞 컬럼 손잡이가 될 수 있다). */
  private _leafOf = new WeakMap<HTMLElement, number>();
  /** 머리글 한 판의 리스너 묶음 신호(머리글 뷰가 준다) — 그 판을 버리면 손잡이 리스너도 함께 떨어진다. */
  private _signal: AbortSignal | undefined;
  /** 머리글 위임 듣개(머리글 요소의 수명 동안 하나). */
  private _headerListeners: AbortController | null = null;
  /** 지금 커서를 바꿔 둔 th 와 그 전 인라인 커서. */
  private _cursorTh: HTMLElement | null = null;
  private _savedCursor = '';
  /** 새 흐름의 협력자(없으면 놓을 때만 옛 commit). */
  private _ports: ResizeBinderPorts | null = null;
  /** 지금 끄는 중이면 그 끌기. */
  private _drag: DragSession | null = null;
  /** Esc 뒤 「놓음 대기」 듣개 묶음 — destroy 때 함께 푼다(Esc 와 놓음 사이 파괴 누수 방지). / Post-Esc release listeners; aborted on destroy. */
  private _escRel: AbortController | null = null;

  constructor(
    private readonly _readWidth: (th: HTMLElement) => number,
    private readonly _commit: (leafIndex: number, width: number) => void,
  ) {}

  /** 잎 컬럼의 지금 폭(px) — th 안 점이 경계에서 얼마나 떨어졌나를 배치 읽기 없이 재려고(컬럼 기하가 안다). */
  private _leafWidth: (leafIndex: number) => number = () => NaN;

  /**
   * 머리글을 새로 그리기 전에 부른다 — 잎 기억을 버리고 새 판의 리스너 묶음 신호를 받는다(옛 손잡이 리스너는 머리글 뷰가
   * 옛 판을 버릴 때 함께 떨어진다). 진행 중인 끌기·「놓음」 상태는 그대로 — 끌기는 컬럼 정체(필드)로 잡고 있으므로
   * 새 판이 그 필드를 다시 알려 주면 바뀐 번호로 이어진다.
   *
   * Call before repainting the header: drops leaf maps and takes the new paint's listener signal (old handle listeners
   * go away when the header view aborts the old paint); an ongoing gesture is kept — it holds the column by field, so it
   * continues at the new index once the new paint registers that field.
   */
  clear(signal?: AbortSignal): void {
    this._signal = signal;
    this._resizable.clear();
    this._leafOfField.clear();
    this._leafOf = new WeakMap();
    this._restoreCursor();
  }

  /**
   * 끌기 새 흐름의 협력자를 받는다(그리드가 그리기 전에 한 번). 받은 뒤로는 끄는 동안 폭 주인에게 폭을 쓰고 스케줄러에 요청만 한다 —
   * DOM 은 스케줄러가 다음 프레임에 한 번, 등록된 폭 자리에만 쓴다(본문을 다시 만들지 않음). 놓을 때는 사용자 폭을 저장할 뿐 다시 그리지 않는다.
   *
   * Receives the live-resize collaborators once. From then on a drag only writes widths to the width owner and submits
   * requests; the scheduler writes the DOM once per frame into registered width spots. Releasing just stores the user width.
   */
  connect(ports: ResizeBinderPorts): void {
    this._ports = ports;
  }

  /** 지운다(리스너 모두 뗌 — 끄는 중이면 확정하지 않고 끝냄). / Detach everything (an ongoing drag ends without commit). */
  destroy(): void {
    this._drag?.end();
    this._drag = null;
    this._escRel?.abort();
    this._escRel = null;
    this.clear();
    this._headerListeners?.abort();
    this._headerListeners = null;
  }

  /**
   * 머리글 요소에 위임 듣개(포인터 이동·누름·나감)를 한 번 단다 — 경계 양쪽 손잡이 영역의 커서와 누름을 맡는다.
   *
   * Attach the delegated listeners (move · press · leave) to the header element once; they own the boundary grip zone.
   *
   * @param leafWidth 잎 컬럼의 지금 폭(px) — 컬럼 기하에 묻는 함수 / current leaf width, asked of the column geometry
   */
  bindHeader(header: HTMLElement, leafWidth: (leafIndex: number) => number): void {
    this._leafWidth = leafWidth;
    this._headerListeners?.abort();
    const ctl = new AbortController();
    this._headerListeners = ctl;
    const opt = { signal: ctl.signal };
    header.addEventListener('mousemove', (e: MouseEvent) => this._hover(e), opt);
    header.addEventListener('mouseleave', () => this._restoreCursor(), opt);
    const press = (e: MouseEvent) => {
      if (this._drag) { if (e.type === 'mousedown') e.preventDefault(); return; }   // 포인터 뒤 호환 mousedown — 선택만 막고 무시
      if (e.button !== 0) return;
      const hit = this._hitAt(e);
      if (hit) this._begin(e, hit.th, hit.ci);
    };
    header.addEventListener('pointerdown', press, opt);
    header.addEventListener('mousedown', press, opt);
  }

  /**
   * 잎 th 를 알려 둔다(끌 수 없는 잎도). 손잡이 영역 판정이 「이 점이 어느 잎 칸 안인가」를 묻는 데 쓴다.
   *
   * Register a leaf th (resizable or not) so the grip zone can tell which leaf cell a point is in.
   */
  leaf(th: HTMLElement, leafIndex: number): void {
    if (leafIndex >= 0) this._leafOf.set(th, leafIndex);
  }

  /**
   * 손잡이 하나에 누름 처리기를 붙인다. leafIndex 가 0 보다 작으면(묶음 머리글) 놓아도 넘기지 않는다.
   * field 는 그 잎 컬럼의 정체 — 끄는 중 머리글이 다시 그려져도 같은 컬럼을 이어 끌고, 없어지면 끌기를 끝내는 데 쓴다.
   *
   * Attach the press handler to one handle. A negative leafIndex (group header) commits nothing on release. field
   * identifies the leaf column so a drag survives a header repaint and ends only when the column is gone.
   */
  attach(handle: HTMLElement, th: HTMLElement, leafIndex: number, field?: string): void {
    if (leafIndex >= 0) {
      this._resizable.set(leafIndex, th);
      if (field !== undefined) this._leafOfField.set(field, leafIndex);
    }
    const press = (e: MouseEvent) => {
      if (this._drag) {
        // 포인터로 시작한 끌기 뒤 오는 호환 mousedown: 옛 손잡이처럼 전파와 기본 동작(글자 선택·끌어 옮기기)만 막는다.
        if (e.type === 'mousedown') { e.stopPropagation(); e.preventDefault(); }
        return;
      }
      if (e.button === 0) this._begin(e, th, leafIndex);
    };
    const opt = this._signal && { signal: this._signal };
    handle.addEventListener('pointerdown', press, opt);
    handle.addEventListener('mousedown', press, opt);
  }

  /**
   * 머리글 click 처리기가 묻는다: 이 click 을 삼켜야 하나(손잡이를 놓은 뒤 따라온 click 이면 true, 한 번만).
   *
   * Asked by the header click handler: swallow this click? True once for the click that follows a release.
   */
  shouldSwallowClick(_e: MouseEvent): boolean {
    return this._gesture.consumeClick();
  }

  /** 점이 손잡이 영역이면 끌 컬럼과 그 th. 손잡이 요소 자체(제 처리기가 있음)·묶음 칸·잎 밖이면 null. */
  private _hitAt(e: MouseEvent): { ci: number; th: HTMLElement; cell: HTMLElement } | null {
    const target = e.target as HTMLElement | null;
    if (!target || target.classList?.contains('og-resize-handle')) return null;
    const cell = target.closest?.('th') as HTMLElement | null;
    if (!cell) return null;
    const leaf = this._leafOf.get(cell);
    if (leaf === undefined) return null;
    const ci = this._zone.columnFor(xInCell(e, target, cell), this._leafWidth(leaf), leaf, (c) => this._resizable.has(c));
    const th = ci >= 0 ? this._resizable.get(ci) : undefined;
    return th ? { ci, th, cell } : null;
  }

  private _hover(e: MouseEvent): void {
    if (this._gesture.phase === 'dragging' || this._gesture.phase === 'pressed') return;
    const hit = this._hitAt(e);
    if (!hit) { this._restoreCursor(); return; }
    const cell = hit.cell;
    if (this._cursorTh === cell) return;
    this._restoreCursor();
    this._cursorTh = cell;
    this._savedCursor = cell.style.cursor;
    cell.style.cursor = RESIZE_CURSOR;
  }

  private _restoreCursor(): void {
    if (this._cursorTh) this._cursorTh.style.cursor = this._savedCursor;
    this._cursorTh = null;
    this._savedCursor = '';
  }

  private _begin(e: MouseEvent, th: HTMLElement, leafIndex: number): void {
    // 마우스 누름이면 옛 손잡이와 같이 전파·기본 동작을 막는다. 포인터 누름은 막지 않는다 — 막으면 호환 mousedown·mousemove·
    // mouseup 이 끄기 끝까지 페이지 문서에 안 간다(사용자 코드의 문서 듣개가 끊김). 선택 막기는 뒤따르는 호환 mousedown 이 맡는다.
    // A mouse press is stopped like the old handle; a pointer press is not cancelled (that would suppress the compatibility
    // mouse events for the whole drag) — the following compatibility mousedown prevents selection instead.
    if (e.type === 'mousedown') {
      e.stopPropagation();
      e.preventDefault();
    }
    const g = this._gesture;
    const ports = this._ports;
    const leaf = leafIndex >= 0;
    // 시작 폭은 기하에서(누를 때 배치 읽기 0). 협력자가 없을 때·묶음 머리글만 옛 읽기.
    const start = ports && leaf ? ports.geometry.widthOf(leafColIndex(leafIndex)) : this._readWidth(th);
    g.press(leafIndex, start, e.clientX, ports && leaf ? ports.sink.boundsOf(leafIndex) : BOUNDS);
    if (g.phase !== 'pressed') return;

    const doc = th.ownerDocument;
    const win = doc.defaultView;
    const pointerId = 'pointerId' in e && typeof (e as PointerEvent).pointerId === 'number' && e.type === 'pointerdown' ? (e as PointerEvent).pointerId : null;
    const target = e.target as Element | null;
    // 누를 때의 잎 번호가 아니라 컬럼 정체(필드)를 잡는다 — 끄는 중 머리글이 다시 그려져도(필터·크기 변화·컬럼 숨김) 지금 번호로 푼다.
    // Hold the column by field, not by the press-time index — resolve the current index on every write.
    let field: string | undefined;
    for (const [k, v] of this._leafOfField) if (v === leafIndex) { field = k; break; }
    const indexNow = (): number => (field === undefined ? leafIndex : this._leafOfField.get(field) ?? -1);
    const ac = new AbortController();
    const on = { signal: ac.signal };
    const session: DragSession = {
      ci: leafIndex, th, pointerId, lastWritten: start,
      end: () => { ac.abort(); if (this._drag === session) this._drag = null; },
    };
    this._drag = session;

    // 폭을 하나 반영: 잎이면 폭 주인 → 스케줄러 요청(DOM 은 스케줄러가 다음 프레임에). 묶음 머리글은 머리글 칸만 늘던 지금 동작 그대로.
    const apply = (w: number, sync: boolean) => {
      if (leaf && ports) {
        const ci = indexNow();
        if (ci < 0) return;
        ports.widths.setWidth(leafColIndex(ci), w);
        session.lastWritten = w;
        ports.scheduler.submit(RenderRequest.of(Change.ColWidth, { widthChangedFrom: ci, sync }));
      } else if (!leaf) {
        th.style.width = `${w}px`;
        th.style.minWidth = `${w}px`;
      }
    };
    // 끌던 컬럼이 없어졌으면(숨김·컬럼 정의 교체) 그 자리로 쓰지도 저장하지도 않고 끝낸다 — 따라오는 click 은 삼킴 상태가 처리.
    // The dragged column is gone (hidden / columns replaced): end without writing or storing.
    const gone = (): boolean => leaf && !!ports && indexNow() < 0;
    // 놓음 뒤 따라오는 click 하나: 창 capture 단계에서 삼켜 정렬로도 페이지 문서 듣개로도 보내지 않는다(다음 프레임에 놓음 끝).
    // 옛 길은 놓을 때 머리글을 통째로 다시 만들어 누른 요소가 빠졌으므로 브라우저가 이 click 을 아예 내지 않았다 — 그와 같게.
    // Swallow the one click following a release at window capture (neither sort nor page listeners see it), matching the
    // old path where the header rebuild on release detached the pressed element so no click was dispatched at all.
    const swallowClick = () => {
      const host = win ?? globalThis;
      const stop = (ev: Event) => { if (g.consumeClick()) ev.stopPropagation(); };
      host.addEventListener('click', stop, { capture: true, once: true });
      host.requestAnimationFrame(() => { host.removeEventListener('click', stop, { capture: true }); g.expireSwallow(); });
    };
    const abandon = () => {
      g.cancel();
      session.end();
      swallowClick();
    };
    const finish = (res: { ci: number; width: number } | null) => {
      if (gone()) { abandon(); return; }
      session.end();
      // 끌었다가 시작 x 로 돌아와 놓으면 상태 기계는 「폭 그대로」(null)를 내지만 화면·폭 주인은 마지막 move 폭이다 —
      // 시작 폭으로 한 번 더 써서 화면 == 기하 == 사용자 폭(저장 안 함 = 시작 폭 그대로)이 늘 성립하게.
      // Released back at the start x: the gesture reports no change but the owner holds the last move width — write the start back.
      if (!res && leaf && ports && session.lastWritten !== start) apply(start, true);
      if (res && leaf) {
        if (ports) {
          if (res.width !== session.lastWritten) apply(res.width, true);   // 마지막 move 와 다른 x 에서 놓음 — 그 폭으로 한 번 더
          ports.sink.commit(indexNow(), res.width);
          if (ports.sink.needsHeaderRemeasure()) ports.sink.remeasureHeader();
        } else {
          this._commit(leafIndex, res.width);
        }
      }
      // click 은 놓음과 같은 작업 안에서 그 뒤에 곧 온다 — 다음 프레임까지 안 왔으면(머리글 밖에서 놓음) 「놓음」을 끝낸다.
      // The click follows the release within the same task; if none came by the next frame, end the swallow.
      swallowClick();
    };
    const onMove = (ev: MouseEvent) => {
      if (pointerId !== null && (ev as PointerEvent).pointerId !== pointerId) return;
      if (gone()) { abandon(); return; }
      const w = g.move(ev.clientX);
      if (w !== null) apply(w, false);
    };
    const onUp = (ev: MouseEvent) => {
      if (pointerId !== null && (ev as PointerEvent).pointerId !== pointerId) return;
      finish(g.release(ev.clientX));
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      const res = g.cancel();
      session.end();
      if (res && leaf && ports) apply(res.width, false);   // 시작 폭으로(다음 프레임에 한 번)
      else if (res && !leaf) apply(res.width, false);
      // 단추는 아직 눌려 있다 — 삼킴을 지금 시작하면 다음 프레임에 끝나 뗄 때 오는 click 이 정렬로 간다. 떼는 순간부터 삼킨다
      // (창이 포커스를 잃으면 뗌이 안 올 수 있으므로 그때 삼킴을 끝냄).
      // The button is still down: start swallowing at release, not now (a frame later the click would reach sort).
      this._escRel?.abort();
      const rel = new AbortController();
      this._escRel = rel;
      const released = () => { rel.abort(); if (this._escRel === rel) this._escRel = null; swallowClick(); };
      doc.addEventListener(pointerId !== null ? 'pointerup' : 'mouseup', released, { capture: true, signal: rel.signal });
      if (pointerId !== null) doc.addEventListener('pointercancel', released, { capture: true, signal: rel.signal });
      win?.addEventListener('blur', () => { rel.abort(); if (this._escRel === rel) this._escRel = null; g.expireSwallow(); }, { signal: rel.signal });
    };
    const onLose = () => finish(g.lose());

    // 포인터로 시작했으면 포인터만, 마우스로 시작했으면 마우스만 듣는다(합성 마우스 사건이 두 번 들어오지 않게).
    if (pointerId !== null) {
      doc.addEventListener('pointermove', onMove, on);
      doc.addEventListener('pointerup', onUp, on);
      doc.addEventListener('pointercancel', onLose, on);
      try { (target as Element & { setPointerCapture?: (id: number) => void })?.setPointerCapture?.(pointerId); } catch { /* 잡기 못 함 — 문서 듣개로 충분 */ }
      // 머리글이 다시 그려져 잡아 둔 손잡이가 문서에서 빠지면 잡기가 풀린다 — 그것은 잃음이 아니다(문서 듣개로 계속 받음).
      // A header repaint detaching the captured handle releases capture; that is not a loss (document listeners continue).
      target?.addEventListener('lostpointercapture', () => { if (target.isConnected) onLose(); }, on);
    } else {
      doc.addEventListener('mousemove', onMove, on);
      doc.addEventListener('mouseup', onUp, on);
    }
    doc.addEventListener('keydown', onKey, { signal: ac.signal, capture: true });
    win?.addEventListener('blur', onLose, on);
  }
}

/**
 * 이벤트 점의 x 를 칸(th) 왼쪽 끝 기준으로. 이벤트의 offsetX 는 대상 요소 기준이라, 대상이 칸 안의 글자·아이콘이면
 * 칸까지의 offsetLeft 를 더한다(입력 처리 때 한 번 — 그리는 길이 아님).
 *
 * x of the event point from the th's left edge; offsetX is relative to the target, so add offsetLeft up to the th.
 */
function xInCell(e: MouseEvent, target: HTMLElement, cell: HTMLElement): number {
  let x = e.offsetX;
  let el: HTMLElement | null = target;
  while (el && el !== cell) {
    x += el.offsetLeft;
    el = el.offsetParent as HTMLElement | null;
  }
  return el === cell ? x : NaN;
}
