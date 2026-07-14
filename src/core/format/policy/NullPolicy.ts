// ============================================================
// DD-04 null/빈값 정책 / DD-04 null policy
// 설계: DD-04 §2.3 · UC-1(a)
// null=미참여(파이프 계속), 문자열=null 표시값. spec.nullPolicy.text 가 우선(DisplayFormatter 조율).
// ============================================================

import type { FormatContext, FormatInput, INullPolicy } from '../types.js';

/**
 * 기본 null 정책. raw 가 null/undefined/'' 이면 기본 표시값(default), 아니면 null(미참여).
 * / Default null policy: raw null/empty → default display; otherwise null (not participating).
 */
export class NullPolicy implements INullPolicy {
  constructor(private readonly defaultText: string = '') {}

  render(input: FormatInput, _ctx: FormatContext): string | null {
    const raw = input.raw;
    if (raw === null || raw === undefined || raw === '') return this.defaultText;
    return null;
  }
}
