// ============================================================
// 셀 안 서식 조각 값 객체 — 글자 한 토막과 그 글꼴. toXml(`<r>`) 만 책임진다. 글꼴 정규화·중복 판별은 FontEntry 에 맡긴다.
// / Rich-text run value object: one piece of text plus its font. Owns only toXml (`<r>`); font normalization is delegated to FontEntry.
// ============================================================

import type { XlsxRichTextRun } from '../types.js';
import { FontEntry } from './XlsxStyleEntries.js';
import { xmlEscape } from './XlsxXml.js';

/** 셀 안 서식 조각. / One in-cell run. */
export class RichTextRunEntry {
  private constructor(readonly text: string, readonly font: FontEntry | undefined) {}

  /** DTO 한 토막 → 값 객체(글자가 비면 undefined). / DTO run → entry (undefined when the text is empty). */
  static from(run: XlsxRichTextRun): RichTextRunEntry | undefined {
    return run.text === '' ? undefined : new RichTextRunEntry(run.text, FontEntry.fromRun(run.style));
  }

  /** DTO 목록 → 값 객체 목록(빈 토막은 버린다). / DTO list → entries (empty runs dropped). */
  static fromAll(runs: ReadonlyArray<XlsxRichTextRun>): RichTextRunEntry[] {
    const out: RichTextRunEntry[] = [];
    for (const r of runs) { const e = RichTextRunEntry.from(r); if (e) out.push(e); }
    return out;
  }

  /** `<r>` 한 조각. / One `<r>` fragment. */
  toXml(): string {
    return `<r>${this.font?.toRunPropsXml() ?? ''}<t xml:space="preserve">${xmlEscape(this.text)}</t></r>`;
  }
}
