import type { CellEditor } from './CellEditor.js';
import type { RenderContext } from '../renderers/CellRenderer.js';
import { formatDate, ctxT } from '../renderers/CellRenderer.js';

/**
 * 날짜 셀 편집기. 네이티브 `<input type="date">` 로 편집하며 `yyyy-MM-dd` 문자열을 커밋한다.
 * / Date cell editor. Edits via a native `<input type="date">` and commits a `yyyy-MM-dd` string.
 *
 * @example
 * const col = { field: 'due', header: '마감일', editor: () => new DateEditor() };
 */
export class DateEditor implements CellEditor {
  private input!: HTMLInputElement;
  private _container!: HTMLElement;
  private _onCommit!: (v: any) => void;
  private _onCancel!: () => void;

  /**
   * 편집기를 컨테이너에 마운트한다. / Mount the editor into a container.
   *
   * @param container - 편집기를 붙일 셀 요소 / Cell element to attach the editor to
   * @param ctx - 렌더 컨텍스트(값·컬럼·행 등) / Render context (value, column, row, …)
   * @param onCommit - 값 확정 콜백 / Callback to commit a value
   * @param onCancel - 편집 취소 콜백 / Callback to cancel editing
   */
  mount(container: HTMLElement, ctx: RenderContext, onCommit: (v: any) => void, onCancel: () => void): void {
    this._container = container;
    this._onCommit  = onCommit;
    this._onCancel  = onCancel;

    container.setAttribute('aria-haspopup', 'dialog');
    container.setAttribute('aria-expanded', 'true');

    this.input = document.createElement('input');
    this.input.type = 'date';
    this.input.className = 'og-cell-input';
    this.input.setAttribute('aria-label', ctx.column.header ?? ctxT(ctx, 'editor.datePick'));

    const raw = ctx.value;
    if (raw) {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (!isNaN(d.getTime())) {
        this.input.value = formatDate(d, 'yyyy-MM-dd');
      }
    }

    this.input.addEventListener('keydown', this._onKeyDown);
    this.input.addEventListener('blur',    this._onBlur);
    container.appendChild(this.input);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); this._onCommit(this.input.value); }
    else if (e.key === 'Escape') this._onCancel();
  };

  private _onBlur = (): void => { this._onCommit(this.input.value); };

  /** 현재 입력 값(`yyyy-MM-dd` 문자열)을 반환. / Return the current input value (`yyyy-MM-dd` string). */
  getValue(): any { return this.input?.value; }
  /** 입력 요소에 포커스. / Focus the input element. */
  focus(): void   { this.input?.focus(); }

  /** 리스너 해제 + aria 상태 원복. / Detach listeners + reset aria state. */
  destroy(): void {
    this._container?.setAttribute('aria-expanded', 'false');
    this.input?.removeEventListener('keydown', this._onKeyDown);
    this.input?.removeEventListener('blur',    this._onBlur);
  }
}
