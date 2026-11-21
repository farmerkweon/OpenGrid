// ============================================================
// xlsx 스타일 항목 값 객체 — 글꼴·채움·테두리·숫자 서식·정렬. 각자 hashKey(중복 판별)·equals·toXml 만 책임진다.
// / xlsx style entry value objects: font, fill, border, number format, alignment. Each owns only hashKey / equals / toXml.
// 입력 DTO(XlsxCellStyleSpec)는 공개 타입이고, 여기 클래스들은 내부 표현이다. 조립은 XlsxStylesRegistry 가 한다.
// / The public XlsxCellStyleSpec is an input DTO; these classes are the internal form, assembled by XlsxStylesRegistry.
// ============================================================

import type { XlsxCellStyleSpec } from '../types.js';
import { xmlEscape } from './XlsxXml.js';

/** 풀에 담기는 항목의 공통 약속. / Contract shared by pooled entries. */
export interface IStyleEntry {
  /** 같은 내용이면 같은 문자열. / Equal content → equal string. */
  hashKey(): string;
  /** XML 한 조각. / One XML fragment. */
  toXml(): string;
}

/** 색 문자열(#rgb·#rrggbb·rgb()·RRGGBB·AARRGGBB) → AARRGGBB 대문자. 못 읽으면 undefined. / Normalize to AARRGGBB; undefined if unreadable. */
export function argb(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const t = c.trim();
  const m = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return 'FF' + [m[1], m[2], m[3]].map(n => Math.min(255, parseInt(n!, 10)).toString(16).padStart(2, '0')).join('').toUpperCase();
  const h = t.replace('#', '').toUpperCase();
  if (!/^[0-9A-F]+$/.test(h)) return undefined;
  if (h.length === 3) return 'FF' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length === 6) return 'FF' + h;
  if (h.length === 8) return h;
  return undefined;
}

/** 글꼴 항목. / Font entry. */
export class FontEntry implements IStyleEntry {
  constructor(
    readonly bold: boolean, readonly italic: boolean, readonly color: string | undefined, readonly size: number = 11,
  ) {}

  /** 기본 글꼴(굵기·기울임·색 없음). / The plain default font. */
  static plain(): FontEntry { return new FontEntry(false, false, undefined); }

  /** 명세에서 글꼴이 필요하면 만든다. / Build when the spec asks for a font. */
  static from(spec: XlsxCellStyleSpec): FontEntry | undefined {
    const color = argb(spec.font?.color?.rgb);
    const bold = !!spec.font?.bold;
    const italic = !!spec.font?.italic;
    return color || bold || italic ? new FontEntry(bold, italic, color) : undefined;
  }

  /** 셀 안 조각용 글꼴(명세가 비면 undefined). / Font for an in-cell run (undefined when the spec is empty). */
  static fromRun(style: { color?: { rgb: string }; bold?: boolean; italic?: boolean; size?: number } | undefined): FontEntry | undefined {
    if (!style) return undefined;
    const color = argb(style.color?.rgb);
    const size = typeof style.size === 'number' && style.size > 0 && Number.isFinite(style.size) ? style.size : 11;
    return color || style.bold || style.italic || size !== 11 ? new FontEntry(!!style.bold, !!style.italic, color, size) : undefined;
  }

  hashKey(): string { return `${this.bold ? 'b' : ''}${this.italic ? 'i' : ''}|${this.color ?? ''}|${this.size}`; }
  equals(o: FontEntry): boolean { return this.hashKey() === o.hashKey(); }
  toXml(): string {
    return '<font>' + (this.bold ? '<b/>' : '') + (this.italic ? '<i/>' : '') + `<sz val="${this.size}"/>` +
      (this.color ? `<color rgb="${this.color}"/>` : '') + '<name val="Calibri"/></font>';
  }
  /** 셀 안 조각의 `<rPr>`. / The `<rPr>` of an in-cell run. */
  toRunPropsXml(): string {
    return '<rPr><rFont val="Calibri"/>' + (this.bold ? '<b/>' : '') + (this.italic ? '<i/>' : '') +
      (this.color ? `<color rgb="${this.color}"/>` : '') + `<sz val="${this.size}"/></rPr>`;
  }
}

/** 채움 항목. / Fill entry. */
export class FillEntry implements IStyleEntry {
  private constructor(private readonly pattern: 'none' | 'gray125' | 'solid', readonly color: string | undefined) {}

  static none(): FillEntry { return new FillEntry('none', undefined); }
  static gray125(): FillEntry { return new FillEntry('gray125', undefined); }
  static solid(color: string): FillEntry { return new FillEntry('solid', color); }

  static from(spec: XlsxCellStyleSpec): FillEntry | undefined {
    const color = argb(spec.fill?.rgb);
    return color ? FillEntry.solid(color) : undefined;
  }

  hashKey(): string { return `${this.pattern}|${this.color ?? ''}`; }
  equals(o: FillEntry): boolean { return this.hashKey() === o.hashKey(); }
  toXml(): string {
    if (this.pattern !== 'solid') return `<fill><patternFill patternType="${this.pattern}"/></fill>`;
    return `<fill><patternFill patternType="solid"><fgColor rgb="${this.color}"/><bgColor indexed="64"/></patternFill></fill>`;
  }
}

/** 테두리 항목(사방 같은 선). / Border entry (same line on all four sides). */
export class BorderEntry implements IStyleEntry {
  constructor(private readonly style: string | undefined, private readonly color: string | undefined) {}

  static none(): BorderEntry { return new BorderEntry(undefined, undefined); }

  static from(spec: XlsxCellStyleSpec): BorderEntry | undefined {
    return spec.border ? new BorderEntry(spec.border.style, argb(spec.border.color?.rgb)) : undefined;
  }

  hashKey(): string { return `${this.style ?? ''}|${this.color ?? ''}`; }
  equals(o: BorderEntry): boolean { return this.hashKey() === o.hashKey(); }
  toXml(): string {
    if (!this.style) return '<border><left/><right/><top/><bottom/><diagonal/></border>';
    const col = this.color ? `rgb="${this.color}"` : 'auto="1"';
    const side = (n: string): string => `<${n} style="${this.style}"><color ${col}/></${n}>`;
    return '<border>' + side('left') + side('right') + side('top') + side('bottom') + '<diagonal/></border>';
  }
}

/** 내장 숫자 서식 번호. / Built-in number format ids. */
const BUILTIN_NUMFMT: Readonly<Record<string, number>> = {
  '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10,
};

/** 사용자 숫자 서식 항목(번호는 등록소가 매긴다). / Custom number-format entry (id assigned by the registry). */
export class NumFmtEntry implements IStyleEntry {
  constructor(readonly code: string, readonly id: number) {}

  /** 내장 서식이면 그 번호, 아니면 undefined. / Built-in id, or undefined. */
  static builtinId(code: string): number | undefined { return BUILTIN_NUMFMT[code]; }

  hashKey(): string { return this.code; }
  equals(o: NumFmtEntry): boolean { return this.code === o.code; }
  toXml(): string { return `<numFmt numFmtId="${this.id}" formatCode="${xmlEscape(this.code)}"/>`; }
}

/** 가로 정렬 항목. / Horizontal-alignment entry. */
export class AlignmentEntry implements IStyleEntry {
  constructor(readonly horizontal: string) {}

  static from(spec: XlsxCellStyleSpec): AlignmentEntry | undefined {
    return spec.align ? new AlignmentEntry(spec.align.horizontal) : undefined;
  }

  hashKey(): string { return this.horizontal; }
  equals(o: AlignmentEntry): boolean { return this.horizontal === o.horizontal; }
  toXml(): string { return `<alignment horizontal="${this.horizontal}"/>`; }
}
