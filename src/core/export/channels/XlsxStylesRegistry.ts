// ============================================================
// xlsx 스타일 등록소 — 스타일 조합 정규화·중복 제거·번호 할당·styles.xml 직렬화(책임 하나).
// / xlsx styles registry: normalizes combos, de-duplicates, assigns indexes, serializes styles.xml (single responsibility).
// 메모리는 고유 조합 수에 비례(셀 수와 무관). 번호 0=기본, 1=머리글, 2=줄무늬(미리 등록).
// / Memory scales with distinct combinations, not cell count. Index 0 = default, 1 = header, 2 = stripe (pre-registered).
// ============================================================

import type { XlsxCellStyleSpec } from '../types.js';
import {
  AlignmentEntry, BorderEntry, FillEntry, FontEntry, NumFmtEntry, type IStyleEntry,
} from './XlsxStyleEntries.js';
import { NS, XML_HEAD } from './XlsxXml.js';

/** 줄무늬 채움색(styles 2번). / Stripe fill color (style index 2). */
export const STRIPE_RGB = 'F5F7FA';

/** 엑셀 셀 서식(cellXfs) 상한 — 넘으면 기본 서식(0)을 쓴다. / cellXfs cap; beyond it the default style 0 is used. */
const MAX_XFS = 64000;

/** 같은 내용은 한 번만 담는 항목 풀. / Pool storing each distinct entry once. */
class EntryPool<T extends IStyleEntry> {
  private readonly items: T[] = [];
  private readonly ids = new Map<string, number>();

  /** 담고 번호를 돌려준다(이미 있으면 그 번호). / Add and return the id (existing id when present). */
  add(entry: T): number {
    const k = entry.hashKey();
    let id = this.ids.get(k);
    if (id === undefined) { id = this.items.length; this.items.push(entry); this.ids.set(k, id); }
    return id;
  }
  get size(): number { return this.items.length; }
  /** `<tag count="n">…</tag>` (비면 빈 문자열). / Wrapped XML; empty string when empty. */
  toXml(tag: string): string {
    return this.items.length === 0 ? '' : `<${tag} count="${this.items.length}">${this.items.map(i => i.toXml()).join('')}</${tag}>`;
  }
}

/** 스타일 등록소. / Style registry. */
export class StylesRegistry {
  private readonly fonts = new EntryPool<FontEntry>();
  private readonly fills = new EntryPool<FillEntry>();
  private readonly borders = new EntryPool<BorderEntry>();
  private readonly numFmts = new EntryPool<NumFmtEntry>();
  private readonly xfs: string[] = [];
  private readonly xfIds = new Map<string, number>();

  constructor() {
    this.fonts.add(FontEntry.plain());
    this.fills.add(FillEntry.none());
    this.fills.add(FillEntry.gray125());
    this.borders.add(BorderEntry.none());
    this.xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
    this.add({ font: { bold: true }, fill: { rgb: 'D9E2F3' } }); // 1 = 머리글. / header
    this.add({ fill: { rgb: STRIPE_RGB } });                       // 2 = 줄무늬. / stripe
  }

  /** 등록된 고유 서식 수. / Distinct registered styles. */
  get size(): number { return this.xfs.length; }

  /** 스타일 등록 → 번호(같은 조합은 같은 번호). / Register a style → index (equal combos share one). */
  add(spec: XlsxCellStyleSpec): number {
    const font = FontEntry.from(spec);
    const fill = FillEntry.from(spec);
    const border = BorderEntry.from(spec);
    const align = AlignmentEntry.from(spec);
    const numFmt = spec.numFmt;
    const key = [font?.hashKey() ?? '', fill?.hashKey() ?? '', border?.hashKey() ?? '', align?.hashKey() ?? '', numFmt ?? ''].join('#');
    const hit = this.xfIds.get(key);
    if (hit !== undefined) return hit;
    if (this.xfs.length >= MAX_XFS) return 0;

    const fontId = font ? this.fonts.add(font) : 0;
    const fillId = fill ? this.fills.add(fill) : 0;
    const borderId = border ? this.borders.add(border) : 0;
    const numFmtId = numFmt ? this.numFmtId(numFmt) : 0;
    const attrs = `numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      (numFmtId ? ' applyNumberFormat="1"' : '') + (fontId ? ' applyFont="1"' : '') + (fillId ? ' applyFill="1"' : '') +
      (borderId ? ' applyBorder="1"' : '') + (align ? ' applyAlignment="1"' : '');
    this.xfs.push(align ? `<xf ${attrs}>${align.toXml()}</xf>` : `<xf ${attrs}/>`);
    const id = this.xfs.length - 1;
    this.xfIds.set(key, id);
    return id;
  }

  private numFmtId(code: string): number {
    const built = NumFmtEntry.builtinId(code);
    if (built !== undefined) return built;
    const next = 164 + this.numFmts.size;
    const probe = new NumFmtEntry(code, next);
    const id = this.numFmts.add(probe);
    return 164 + id;
  }

  /** styles.xml 전체(마지막에 한 번). / Full styles.xml (serialized once at the end). */
  toXml(): string {
    return XML_HEAD + `<styleSheet xmlns="${NS}">` +
      this.numFmts.toXml('numFmts') + this.fonts.toXml('fonts') + this.fills.toXml('fills') + this.borders.toXml('borders') +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }
}

