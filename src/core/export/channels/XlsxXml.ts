// ============================================================
// xlsx XML 공용 조각 — 이스케이프·열 이름·머리말. / Shared xlsx XML bits: escaping, column letters, prolog.
// ============================================================

/** XML 에서 허용되지 않는 제어문자 제거 + 특수문자 이스케이프. / Strip illegal control chars + escape. */
export function xmlEscape(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 0-base 열 → A, B, … AA. / 0-based column → letters. */
export function colName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
