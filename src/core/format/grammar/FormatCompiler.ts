// ============================================================
// DD-04 버전드 포맷 문법 컴파일러 / DD-04 versioned format-grammar compiler
// 설계: DD-04 §2.5·UC-4 · REQ-T2-038 · TX-888
// Excel식 포맷 문자열('#,##0;[Red](#,##0)') → 버전드 다중섹션 AST.
// v1 문법: 부호 4섹션(pos;neg;zero;text)만 정본. 조건 섹션은 additive 예약(grammarVersion 2+).
// 파싱 실패는 throw 아닌 진단 + 원문 리터럴 폴백(never-throw).
// ============================================================

import type {
  FormatAst, FormatDiagnostic, FormatSection, FormatToken, IUserFormatCompiler,
} from '../types.js';

/** 현 문법 버전(additive 진화). / Current grammar version. */
export const FORMAT_GRAMMAR_VERSION = 1;

/** 색코드 어휘([Red] 등). / Color-code vocabulary. */
const COLOR_CODES = new Set(['Red', 'Blue', 'Green', 'Black', 'White', 'Yellow', 'Cyan', 'Magenta']);

/** 숫자 토큰 매칭(#,##0.00 형태). / Numeric token matcher. */
const NUM_TOKEN = /[#0][#0,]*(?:\.[#0]+)?/;

/** 한 섹션 문자열을 토큰 배열 + 색코드로 컴파일. / Compile one section string into tokens + color code. */
function compileSection(src: string, diagnostics: FormatDiagnostic[]): FormatSection {
  let colorCode: string | undefined;
  // 색코드 추출 [Red] / extract color code
  const body = src.replace(/\[([A-Za-z]+)\]/g, (_m, code: string) => {
    if (COLOR_CODES.has(code)) { colorCode = code; return ''; }
    diagnostics.push({ severity: 'warn', message: `unknown color/condition token [${code}]` });
    return '';
  });

  const tokens: FormatToken[] = [];
  const m = NUM_TOKEN.exec(body);
  if (!m) {
    // 숫자 토큰 없음 → 전체 리터럴 / no numeric token → whole literal
    if (body) tokens.push({ t: 'lit', s: body });
    return colorCode !== undefined ? { tokens, colorCode } : { tokens };
  }

  const token = m[0];
  const prefix = body.slice(0, m.index);
  const suffix = body.slice(m.index + token.length);

  if (prefix) tokens.push({ t: 'lit', s: prefix });
  const grouping = token.includes(',');
  const dot = token.indexOf('.');
  tokens.push({ t: 'int', grouping });
  if (dot >= 0) tokens.push({ t: 'frac', digits: token.length - dot - 1 });
  // 접미 백분율 토큰 인지 / recognize trailing percent
  if (suffix.startsWith('%')) {
    tokens.push({ t: 'percent' });
    const rest = suffix.slice(1);
    if (rest) tokens.push({ t: 'lit', s: rest });
  } else if (suffix) {
    tokens.push({ t: 'lit', s: suffix });
  }

  return colorCode !== undefined ? { tokens, colorCode } : { tokens };
}

/**
 * 기본 포맷 컴파일러. 세미콜론 다중섹션(pos;neg;zero;text), 색코드, 숫자토큰 파싱.
 * / Default compiler: semicolon multi-section, color codes, numeric token parsing.
 */
export class FormatCompiler implements IUserFormatCompiler {
  readonly grammarVersion = FORMAT_GRAMMAR_VERSION;

  compile(format: string): { ast: FormatAst; diagnostics: FormatDiagnostic[] } {
    const diagnostics: FormatDiagnostic[] = [];
    if (!format) {
      diagnostics.push({ severity: 'warn', message: 'empty format string' });
      return { ast: { grammarVersion: this.grammarVersion, sections: [{ tokens: [] }] }, diagnostics };
    }
    const parts = format.split(';');
    if (parts.length > 4) {
      diagnostics.push({ severity: 'warn', message: 'more than 4 sections; extra sections ignored (v1 grammar)' });
    }
    const sections = parts.slice(0, 4).map((p) => compileSection(p, diagnostics));
    return { ast: { grammarVersion: this.grammarVersion, sections }, diagnostics };
  }
}

/** 공유 컴파일러 싱글턴(순수·상태 없음). / Shared stateless compiler singleton. */
export const defaultFormatCompiler = new FormatCompiler();
