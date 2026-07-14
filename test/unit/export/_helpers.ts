// DD-15 export 테스트 공용 헬퍼 — 실제 DD-04 DisplayFormatter 로 소스 조립(화면과 동일 파이프).
import { createDisplayFormatter, compileFormatSpec } from '../../../src/core/format/index.js';
import type { FormatContext } from '../../../src/core/format/types.js';
import { GridArtifactSource } from '../../../src/core/export/GridArtifactSource.js';
import type { ArtifactColumn } from '../../../src/core/export/GridArtifactSource.js';
import type { VisualSpec } from '../../../src/core/cf/encoders.js';

export const CTX: FormatContext = { locale: { intlLocale: 'ko-KR' }, themeEpoch: 0, consumer: 'export' };

export function moneyCol(field: string, header: string): ArtifactColumn<any> {
  return { field, header, align: 'right', widthPx: 120, spec: compileFormatSpec({ field, type: 'currency', currency: 'KRW' }) };
}
export function numCol(field: string, header: string): ArtifactColumn<any> {
  return { field, header, align: 'right', widthPx: 90, spec: compileFormatSpec({ field, type: 'number' }) };
}
export function textCol(field: string, header: string): ArtifactColumn<any> {
  return { field, header, align: 'left', widthPx: 140, spec: compileFormatSpec({ field, type: 'text' }) };
}
export function abbrevCol(field: string, header: string): ArtifactColumn<any> {
  return {
    field, header, align: 'right', widthPx: 90,
    spec: compileFormatSpec({ field, type: 'number', abbreviate: { style: 'short', threshold: 1000 } }),
  };
}

export function makeSource(
  rows: ReadonlyArray<Record<string, any>>,
  columns: ReadonlyArray<ArtifactColumn<any>>,
  extra?: {
    cfFor?: (row: any, col: ArtifactColumn<any>, i: number) => VisualSpec | undefined;
    placeFor?: (r: number, c: number) => { rowSpan: number; colSpan: number; hidden: boolean } | undefined;
    state?: () => 'ready' | 'loading' | 'error' | 'empty';
  },
) {
  const formatter = createDisplayFormatter();
  const deps: any = {
    rows: () => rows,
    columns: () => columns,
    formatter,
    ctx: () => CTX,
  };
  if (extra?.cfFor) deps.cfFor = extra.cfFor;
  if (extra?.placeFor) deps.placeFor = extra.placeFor;
  if (extra?.state) deps.state = extra.state;
  return { formatter, source: new GridArtifactSource(deps) };
}

/** async stream → 평탄 RowArtifact 배열. */
export async function collectRows(source: { projectRows: (o?: any) => AsyncIterable<any> }, opts?: any) {
  const out: any[] = [];
  for await (const chunk of source.projectRows(opts)) {
    out.push(...chunk.rows);
    if (chunk.done) break;
  }
  return out;
}
