// ============================================================
// DD-15 §2.4 채널 능력 선언(ChannelCapabilities SSOT) — 손실 매니페스트 입력(REQ-T3-804)
// / DD-15 §2.4 per-channel capability declarations — feed the loss manifest.
// ------------------------------------------------------------
// 채널 표현력을 '데이터로' 선언. CSV=값만(cf/병합/스타일 불가), xlsx=색/병합/스타일 가능 등.
// ============================================================

import type { ChannelCapabilities, ChannelId } from '../types.js';

const NONE: ChannelCapabilities = {
  merges: false, frozen: false, colWidths: false, cf: false, filters: false,
  sort: false, hiddenCols: false, groupCollapse: false, charts: false,
  styling: false, provenance: false,
};

/** CSV — 값 + provenance 주석행만. 색/병합/스타일 불가. / CSV: values + comment-row provenance only. */
export const CSV_CAPS: ChannelCapabilities = { ...NONE, provenance: true };

/** JSON — 값 + provenance 사이드카. / JSON: values + provenance sidecar. */
export const JSON_CAPS: ChannelCapabilities = { ...NONE, provenance: true };

/** XML — 값 + provenance 주석. / XML: values + comment provenance. */
export const XML_CAPS: ChannelCapabilities = { ...NONE, provenance: true };

/** xlsx — 병합·컬럼폭·CF 색·스타일·provenance(시트메모). / xlsx: merges/widths/cf/styling/provenance. */
export const XLSX_CAPS: ChannelCapabilities = {
  ...NONE, merges: true, colWidths: true, cf: true, styling: true, provenance: true,
};

/** print — 병합·CF(흑백 강등)·스타일·차트·provenance(페이지 푸터). / print: merges/cf/styling/charts/provenance. */
export const PRINT_CAPS: ChannelCapabilities = {
  ...NONE, merges: true, colWidths: true, cf: true, styling: true, charts: true, provenance: true,
};

/** 기본 능력 매트릭스(매니페스트 조립용). / Default capability matrix for the manifest. */
export const DEFAULT_CAPS: Readonly<Record<ChannelId, ChannelCapabilities>> = {
  csv: CSV_CAPS,
  json: JSON_CAPS,
  xml: XML_CAPS,
  xlsx: XLSX_CAPS,
  html: PRINT_CAPS,
  pdf: PRINT_CAPS,
  print: PRINT_CAPS,
};
