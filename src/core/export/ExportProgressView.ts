// ============================================================
// 대량 내보내기 진척바 — 모달 오버레이(제목·퍼센트 막대·N/M 행·취소). DOM 이 없으면 아무 일도 하지 않는다.
// / Large-export progress bar — modal overlay (title, percent bar, N/M rows, cancel). No-op without a DOM.
// ============================================================

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** 진척바 생성 옵션. / Options for the progress view. */
export interface ExportProgressViewOptions {
  /** i18n 해석기(미주입 시 영문 기본 문구). / i18n resolver (English fallback when absent). */
  t?: Translate | undefined;
  /** 취소 단추 콜백. / Cancel button callback. */
  onCancel?: () => void;
}

const FALLBACK: Record<string, string> = {
  'export.preparing': 'Preparing export…',
  'export.exporting': 'Exporting {done} / {total} rows ({percent}%)',
  'export.cancel': 'Cancel',
  'export.cancelled': 'Export cancelled',
  'export.done': 'Export complete',
  'export.exportError': 'Export failed',
};

export class ExportProgressView {
  private _root: HTMLElement | null = null;
  private _bar: HTMLElement | null = null;
  private _text: HTMLElement | null = null;
  private _btn: HTMLButtonElement | null = null;
  private _closed = false;
  private _failed = false;
  private _prevFocus: Element | null = null;

  constructor(private readonly opts: ExportProgressViewOptions = {}) {
    if (typeof document === 'undefined' || !document.body) return;
    const root = document.createElement('div');
    root.className = 'og-export-progress';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', this._t('export.preparing'));
    root.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1100;' +
      'display:flex;align-items:center;justify-content:center;font:14px/1.4 sans-serif;';
    const panel = document.createElement('div');
    panel.className = 'og-export-progress__panel';
    panel.style.cssText =
      'box-sizing:border-box;width:min(360px,90vw);padding:16px;background:#fff;color:#212121;' +
      'border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,0.3);';
    const text = document.createElement('div');
    text.className = 'og-export-progress__text';
    text.setAttribute('aria-live', 'polite');
    text.textContent = this._t('export.preparing');
    const track = document.createElement('div');
    track.className = 'og-export-progress__track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    track.style.cssText = 'height:8px;margin:12px 0;background:#e0e0e0;border-radius:4px;overflow:hidden;';
    const bar = document.createElement('div');
    bar.className = 'og-export-progress__bar';
    bar.style.cssText = 'height:100%;width:0%;background:#1565c0;';
    track.appendChild(bar);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'og-export-progress__cancel';
    btn.textContent = this._t('export.cancel');
    btn.addEventListener('click', () => this.opts.onCancel?.());
    panel.append(text, track, btn);
    root.appendChild(panel);
    // 포커스: 열 때 취소 단추로, Esc→취소(오류 표시 중엔 닫기), Tab 은 단추에 가둔다. / Focus the button, Esc cancels (closes after failure), Tab trapped.
    root.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); if (this._failed) this.close(); else this.opts.onCancel?.(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); this._btn?.focus(); }
    });
    this._prevFocus = document.activeElement;
    document.body.appendChild(root);
    btn.focus();
    this._root = root; this._bar = bar; this._text = text; this._btn = btn;
  }

  private _t(key: string, params?: Record<string, string | number>): string {
    const r = this.opts.t?.(key, params);
    if (r && r !== key) return r;
    return (FALLBACK[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? ''));
  }

  /** 진행 갱신. / Update progress. */
  update(done: number, total: number): void {
    if (this._closed || !this._root) return;
    const percent = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
    this._bar!.style.width = `${percent}%`;
    this._bar!.parentElement!.setAttribute('aria-valuenow', String(percent));
    this._text!.textContent = this._t('export.exporting', { done, total, percent });
  }

  /** 오류 표시(취소 단추는 닫기 역할로 바뀐다). / Show an error; the button becomes a close button. */
  fail(message?: string): void {
    if (this._closed || !this._root) return;
    this._text!.textContent = message ? `${this._t('export.exportError')}: ${message}` : this._t('export.exportError');
    this._failed = true;
    this._root.setAttribute('role', 'alertdialog');
    this._btn!.textContent = 'OK';
    this._btn!.onclick = () => this.close();
  }

  /** 닫기. 여러 번 불러도 안전. / Close; idempotent. */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this._root?.remove();
    (this._prevFocus as HTMLElement | null)?.focus?.();
    this._prevFocus = null;
    this._root = this._bar = this._text = this._btn = null;
  }

  get isOpen(): boolean { return !this._closed && !!this._root; }
}
