// ============================================================
// interpolate — '{name}' 명명 보간 1종 / single named '{name}' interpolation
// ------------------------------------------------------------
// 설계 근거(Why): I18N_DESIGN.md §C6/§7. zero-dependency 경량 정체성 — ICU 미도입.
//   `{name}` 치환 + `{{`/`}}` 리터럴 이스케이프만. 누락 파라미터는 플레이스홀더 잔존(U3 확정).
//   토큰이 없는 문자열(대다수 ko 라벨)은 정규식을 건너뛰는 fast-path(핫패스 aria).
// / Design: I18N_DESIGN.md §C6/§7. Zero-dependency identity — no ICU. Only `{name}` substitution
//   plus `{{`/`}}` literal escapes. Missing params keep the placeholder (U3). Token-free strings
//   (most ko labels) take a fast-path skipping the regex (hot-path aria).
// ============================================================

/**
 * `{name}` 명명 파라미터를 치환한다. `{{`→`{`, `}}`→`}` 이스케이프. 누락 파라미터는 플레이스홀더 유지.
 * / Substitute `{name}` params. Escapes `{{`→`{`, `}}`→`}`. Missing params keep the placeholder.
 */
export function interpolate(template: string, params?: Readonly<Record<string, string | number>>): string {
  if (template.indexOf('{') === -1) return template; // fast-path: 토큰 없음 / no tokens
  return template.replace(/\{\{|\}\}|\{(\w+)\}/g, (match, name?: string) => {
    if (match === '{{') return '{';
    if (match === '}}') return '}';
    const v = params ? params[name!] : undefined;
    return v === undefined ? match : String(v); // 누락 → 플레이스홀더 잔존 / missing → keep placeholder
  });
}
