// ============================================================
// DD-04 ④ 사용자 포맷 AST 렌더러 / DD-04 ④ user-format AST renderer
// 설계: DD-04 §2.3·§2.5·UC-4 · REQ-T2-038
// 컴파일된 AST + InterpretedValue → 표시 문자열·색코드. 다중섹션(부호) 선택 + 토큰 렌더.
// 로케일 그룹핑/소수는 Intl 위임(ctx.locale.intlLocale). 색코드는 colorHint 로만 부착(색 단독 금지).
// ============================================================

import type {
  AstRender, FormatAst, FormatContext, FormatSection, FormatToken,
  ILocaleFormat, InterpretedValue, IUserFormatSpec,
} from '../types.js';

/** 부호로 다중섹션 선택(pos;neg;zero;text). / Pick a section by sign. */
function pickSection(ast: FormatAst, v: InterpretedValue): { section: FormatSection; useAbs: boolean } {
  const s = ast.sections;
  if (v.sign === 'neg' && s.length >= 2) return { section: s[1]!, useAbs: true };
  if (v.sign === 'zero' && s.length >= 3) return { section: s[2]!, useAbs: false };
  // 텍스트 섹션은 비수치 전용(현 파이프는 수치 경로에서만 AST 사용) / text section reserved
  return { section: s[0]!, useAbs: false };
}

/** 숫자 토큰(int/frac) 존재 시 로케일 숫자 본문 산출. / Build the locale numeric body from int/frac tokens. */
function renderNumber(
  tokens: FormatToken[], n: number, locale: ILocaleFormat, ctx: FormatContext,
): string {
  let grouping = false;
  let digits: number | undefined;
  let hasInt = false;
  for (const t of tokens) {
    if (t.t === 'int') { hasInt = true; grouping = t.grouping; }
    else if (t.t === 'frac') digits = t.digits;
  }
  if (!hasInt) return '';
  const d = digits != null ? { minFraction: digits, maxFraction: digits, grouping } : { grouping };
  return locale.formatNumber(n, d, ctx);
}

/**
 * 기본 AST 렌더러. 로케일 서식기를 주입받아 숫자 본문을 로케일 위임으로 산출한다.
 * / Default AST renderer; delegates numeric body to the injected locale formatter.
 */
export class AstRenderer implements IUserFormatSpec {
  constructor(private readonly locale: ILocaleFormat) {}

  apply(ast: FormatAst, v: InterpretedValue, ctx: FormatContext): AstRender {
    const n = v.magnitude ?? 0;
    const { section, useAbs } = pickSection(ast, v);
    const value = useAbs ? Math.abs(n) : n;
    const body = renderNumber(section.tokens, value, this.locale, ctx);

    let out = '';
    for (const t of section.tokens) {
      switch (t.t) {
        case 'lit': out += t.s; break;
        case 'int': out += body; break; // int 토큰 위치에 로케일 본문(frac 은 본문에 포함) / body placed at int
        case 'frac': break;             // frac 은 int 본문에 이미 포함 / already in body
        case 'currencySym': out += ''; break; // 로케일 심볼은 리터럴로 처리(컴파일러가 lit 로 보존) / literal
        case 'percent': out += '%'; break;
      }
    }
    // 음수 섹션(괄호/색 등 형태 부호화)은 −기호 형태의 aria 를 병기(색·괄호 단독 부호화 금지, AA KM-DB016).
    // / Negative sections carry a minus-form aria so screen readers do not depend on parens/color alone.
    const r: { text: string; colorHint?: string; aria?: string } = { text: out };
    if (section.colorCode !== undefined) r.colorHint = section.colorCode;
    if (v.sign === 'neg' && body) r.aria = `-${body}`;
    return r;
  }
}
