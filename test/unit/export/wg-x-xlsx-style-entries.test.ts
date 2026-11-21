// 스타일 값 객체 단위 시험 — 각자 hashKey·equals·toXml 만 본다. / Unit tests for style entry value objects.
import { describe, it, expect } from 'vitest';
import { AlignmentEntry, BorderEntry, FillEntry, FontEntry, NumFmtEntry, argb } from '../../../src/core/export/channels/XlsxStyleEntries.js';

describe('argb 정규화', () => {
  it('여러 표기가 같은 AARRGGBB 로 모인다', () => {
    expect(argb('#f00')).toBe('FFFF0000');
    expect(argb('ff0000')).toBe('FFFF0000');
    expect(argb('rgb(255, 0, 0)')).toBe('FFFF0000');
    expect(argb('80FF0000')).toBe('80FF0000');
    expect(argb('red')).toBeUndefined();
    expect(argb(undefined)).toBeUndefined();
  });
});

describe('값 객체', () => {
  it('FontEntry: 명세에 글꼴이 없으면 만들지 않고, 같은 내용은 equals', () => {
    expect(FontEntry.from({})).toBeUndefined();
    const a = FontEntry.from({ font: { bold: true, color: { rgb: '#336699' } } })!;
    const b = FontEntry.from({ font: { color: { rgb: 'FF336699' }, bold: true } })!;
    expect(a.equals(b)).toBe(true);
    expect(a.toXml()).toBe('<font><b/><sz val="11"/><color rgb="FF336699"/><name val="Calibri"/></font>');
    expect(a.equals(FontEntry.plain())).toBe(false);
  });
  it('FillEntry: solid 는 fgColor, none·gray125 는 패턴만', () => {
    expect(FillEntry.from({ fill: { rgb: 'FF0000' } })!.toXml()).toContain('<fgColor rgb="FFFF0000"/>');
    expect(FillEntry.none().toXml()).toBe('<fill><patternFill patternType="none"/></fill>');
    expect(FillEntry.from({})).toBeUndefined();
  });
  it('BorderEntry·AlignmentEntry·NumFmtEntry', () => {
    expect(BorderEntry.from({ border: { style: 'thin', color: { rgb: '000000' } } })!.toXml()).toContain('<left style="thin"><color rgb="FF000000"/></left>');
    expect(BorderEntry.none().toXml()).toContain('<left/>');
    expect(AlignmentEntry.from({ align: { horizontal: 'center' } })!.toXml()).toBe('<alignment horizontal="center"/>');
    expect(NumFmtEntry.builtinId('#,##0.00')).toBe(4);
    expect(NumFmtEntry.builtinId('0.000')).toBeUndefined();
    expect(new NumFmtEntry('0.0"%"', 164).toXml()).toBe('<numFmt numFmtId="164" formatCode="0.0&quot;%&quot;"/>');
  });
});
