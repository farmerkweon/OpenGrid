// ============================================================
// DD-04 ③ 로케일 서식 / DD-04 ③ locale formatting
// 설계: DD-04 §2.3·§5 · REQ-T9-001 · T2-011
// Intl(NumberFormat/DateTimeFormat) 기반. 하드코딩 ko-KR 제거 — ctx.locale.intlLocale 사용.
// ============================================================

import type { FormatContext, ILocaleFormat, NumberDirective } from '../types.js';

/** Intl 옵션 조립(자릿수·그룹핑). / Assemble Intl number options. */
function numOpts(d: NumberDirective): Intl.NumberFormatOptions {
  const o: Intl.NumberFormatOptions = { useGrouping: d.grouping ?? true };
  if (d.minFraction != null) o.minimumFractionDigits = d.minFraction;
  if (d.maxFraction != null) o.maximumFractionDigits = d.maxFraction;
  return o;
}

/**
 * Intl 기반 로케일 서식. 잘못된 로케일/통화는 throw 아닌 폴백(never-throw, 렌더 루프 소비자).
 * / Intl-based locale formatting; invalid locale/currency falls back instead of throwing.
 */
export class LocaleFormat implements ILocaleFormat {
  formatNumber(n: number, d: NumberDirective, ctx: FormatContext): string {
    try {
      return new Intl.NumberFormat(ctx.locale.intlLocale, numOpts(d)).format(n);
    } catch {
      return String(n);
    }
  }

  formatCurrency(n: number, currency: string, d: NumberDirective, ctx: FormatContext): string {
    try {
      return new Intl.NumberFormat(ctx.locale.intlLocale, {
        style: 'currency', currency, ...numOpts(d),
      }).format(n);
    } catch {
      // 잘못된 통화코드 → 숫자 폴백 + 코드 접미 / invalid currency → number + code suffix
      return `${this.formatNumber(n, d, ctx)} ${currency}`;
    }
  }

  formatPercent(n: number, d: NumberDirective, ctx: FormatContext): string {
    // 도메인 규약: magnitude 는 이미 퍼센트 스케일(12.5 → "12.5%"). Intl 은 분수 기대 → /100.
    // / Convention: magnitude is percent-scale (12.5 → 12.5%); Intl expects a fraction → /100.
    try {
      const o: Intl.NumberFormatOptions = { style: 'percent', useGrouping: d.grouping ?? true };
      if (d.minFraction != null) o.minimumFractionDigits = d.minFraction;
      if (d.maxFraction != null) o.maximumFractionDigits = d.maxFraction;
      else o.maximumFractionDigits = 2;
      return new Intl.NumberFormat(ctx.locale.intlLocale, o).format(n / 100);
    } catch {
      return `${this.formatNumber(n, d, ctx)}%`;
    }
  }

  formatDate(d: Date, pattern: string | undefined, ctx: FormatContext): string {
    if (isNaN(d.getTime())) return '';
    // 커스텀 패턴(yyyy/MM/dd 토큰) 지정 시 로케일 무관 치환(명시 우선). / Explicit token pattern wins.
    if (pattern) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return pattern
        .replace('yyyy', String(y))
        .replace('MM', mo)
        .replace('dd', day)
        .replace('HH', hh)
        .replace('mm', mi)
        .replace('ss', ss);
    }
    try {
      return new Intl.DateTimeFormat(ctx.locale.intlLocale).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }
}
