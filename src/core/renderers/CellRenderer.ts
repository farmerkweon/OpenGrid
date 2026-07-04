import type { ColumnDef, RendererDef } from '../types.js';
import { round } from '../MathUtils.js';
import { OGDecimal } from '../OGDecimal.js';
import { evaluateFormula } from '../FormulaEngine.js';
import { applyMask } from '../MaskingEngine.js';
import { defaultAppearance } from '../AppearanceResolver.js';
import { iconRegistry } from '../IconRegistry.js';

export interface RenderContext<T = any> {
  value: any;
  row: T;
  rowIndex: number;
  column: ColumnDef<T>;
  colIndex: number;
  isSelected: boolean;
  rowState: 'none' | 'added' | 'edited' | 'removed';
  displayValue?: string | null;
  /** R1b: per-instance displayFormatter 전략(값·필드·행 → 표시문자열|null). Number/Date 렌더러가
   *  ctx.value 위에 적용한다(모듈전역 없이 멀티그리드 격리). null 반환/미설정 시 기본 포맷 폴백.
   *  ※ getDisplayValue override(text 경로의 ctx.displayValue)와 달리 **전략만** 적용 — 숫자/날짜의
   *    기본 포맷(천단위·통화·정밀도)을 보존하고 그룹모드 인덱스 불일치를 피한다. */
  displayFormatter?: ((value: any, field: string, row: any) => string | null) | null;
  /** C7(15_cross_contracts.md/F3-R14): 이 셀에 F3 셀 수식이 있으면 true — ColumnDef.formula 재평가를 skip. */
  hasCellFormula?: boolean;
}

export interface CellRenderer {
  render(ctx: RenderContext): HTMLElement;
}

// ─── displayFormatter(표시값 override) — per-instance 경로 ──────────
/**
 * R1(OOP 리팩터, DIP 수정): 과거엔 formatNumber/formatDate 가 host 참조가 없어 **모듈 전역**
 * resolver 로 displayFormatter 슬롯에 도달했다. 그 전역은 매 OpenGrid 생성자가 덮어써,
 * 한 페이지에 그리드가 여럿이면 마지막 그리드의 포매터가 전 그리드에 새는 P0 정합성 결함이었다.
 * → 전역을 제거했다. 이제 displayFormatter 는 **per-instance 안전 경로 하나**로만 흐른다:
 *   OpenGrid.getDisplayValue(슬롯 읽기) → GridRenderer 가 RenderContext.displayValue 로 주입
 *   → 각 셀 렌더러(Text/Number/Date)가 ctx.displayValue 를 우선 사용.
 * formatNumber/formatDate 는 전역 상태 0 의 순수 포맷 함수로 환원했다(출력 동일, 회귀 0).
 */

// ─── 수식 평가 헬퍼 ───────────────────────────────────────
/**
 * 컬럼에 formula가 있으면 OGDecimal로 평가해 표시값(string)을 반환.
 * formula가 없으면 null 반환 → 기존 ctx.value 사용.
 */
export function resolveFormula(ctx: RenderContext): string | null {
  // C7(F3-R14): 이 셀에 셀 수식(F3)이 저장돼 있으면 컬럼 수식(ColumnDef.formula) 재평가를
  // skip 하고 저장된 계산값(ctx.value, setComputedValue 로 이미 기록됨)을 그대로 쓴다.
  if (ctx.hasCellFormula) return null;
  const col = ctx.column;
  if (!col.formula) return null;
  const prec = col.formulaPrecision ?? 30;
  try {
    let result: any;
    if (typeof col.formula === 'function') {
      result = col.formula(ctx.row, OGDecimal);
    } else {
      result = evaluateFormula(col.formula, ctx.row as Record<string, any>, prec);
    }
    // OGDecimal → toFixed(precision) or toString
    if (result instanceof OGDecimal) {
      return col.precision != null ? result.toFixed(col.precision) : result.toString();
    }
    // string 반환된 경우 그대로 사용
    if (typeof result === 'string') return result;
    // number 등 → precision 적용
    return col.precision != null
      ? OGDecimal.from(result).toFixed(col.precision)
      : String(result);
  } catch (e) {
    console.warn('[OpenGrid] Formula error:', e);
    return '#ERR';
  }
}

// ─── 숫자 포맷 유틸 ───────────────────────────────────────
/**
 * 숫자 포맷.
 *  format 문자열:
 *   '#,##0'          천단위 콤마, 정수
 *   '#,##0.00'       천단위 콤마, 소수 2자리
 *   '₩#,##0'         통화 접두 (₩1,234)
 *   '$#,##0.00'      통화 접두 ($1,234.56)
 *   '#,##0원'        통화 접미 (1,234원)
 *   '$#,##0;($#,##0)' 양수;음수 패턴 — 음수를 괄호로 (회계식)
 *  currency: ISO 통화코드('KRW'|'USD'|'EUR'…) 지정 시 Intl.NumberFormat 로케일 통화 포맷 우선.
 */
export function formatNumber(value: any, format?: string, precision?: number, currency?: string, field?: string, row?: any): string {
  if (value == null || value === '') return '';
  let num = Number(value);
  if (isNaN(num)) return String(value);

  // F4: precision 지정 시 epsilon round 적용
  if (precision != null) num = round(num, precision);

  // ISO 통화코드 지정 시 → Intl 로케일 통화 포맷 (format 무시)
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency,
        ...(precision != null ? { minimumFractionDigits: precision, maximumFractionDigits: precision } : {}),
      }).format(num);
    } catch { /* 잘못된 코드 → 아래 format 폴백 */ }
  }

  if (!format) {
    // precision 지정 시 소수점 자리 고정 표시
    return precision != null ? num.toFixed(precision) : String(num);
  }

  // 음수 전용 패턴: "양수포맷;음수포맷" (음수면 부호는 포맷이 표현 → 절댓값 사용)
  const semi = format.indexOf(';');
  const negFmt = semi >= 0 ? format.slice(semi + 1) : null;
  const useFmt = (num < 0 && negFmt != null) ? negFmt : (semi >= 0 ? format.slice(0, semi) : format);
  const abs = (num < 0 && negFmt != null) ? Math.abs(num) : num;

  // 숫자 토큰(#,0,.)과 접두/접미(통화기호 등) 분리
  const m = useFmt.match(/[#0][#0,]*(?:\.[#0]+)?/);
  if (!m) return String(num);   // 숫자 토큰 없음 → 기존 동작 유지
  const token  = m[0];
  const prefix = useFmt.slice(0, m.index);
  const suffix = useFmt.slice(m.index! + token.length);

  const useGrouping = token.includes(',');
  const decimals = token.includes('.') ? token.split('.')[1]!.length : (precision ?? 0);
  const body = abs.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping,
  });

  return prefix + body + suffix;
}

// ─── 날짜 포맷 유틸 ───────────────────────────────────────
export function formatDate(value: any, format = 'yyyy-MM-dd', field?: string, row?: any): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return format
    .replace('yyyy', String(y))
    .replace('MM', m)
    .replace('dd', day);
}

// ─── F5: 마스킹 셀 렌더링 헬퍼 ──────────────────────────
/**
 * 마스킹된 셀을 렌더링한다.
 * - 좌측: 마스킹 문자열 (monospace)
 * - 우측: 눈 아이콘 버튼 — 클릭 시 해당 셀만 원문 표시 (DOM 직접 교체)
 *
 * 재렌더 시 col._maskRevealedRows에 rowIndex가 있으면 원문이 유지된다.
 */
function _renderMasked(original: string, col: ColumnDef, rowIndex: number): HTMLElement {
  const masked = applyMask(original, col.mask!);

  const wrap = document.createElement('span');
  wrap.style.cssText =
    'display:flex;align-items:center;gap:3px;overflow:hidden;width:100%;box-sizing:border-box;';

  const text = document.createElement('span');
  text.style.cssText =
    'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
    'font-family:monospace;letter-spacing:0.4px;color:var(--og-mask-text,#888);';
  text.textContent = masked;

  // 눈 아이콘 — IconRegistry role 'mask.reveal'(글리프 = 커스텀 eye-reveal, 시각 동일).
  // R12c: 하드코딩 인라인 SVG 를 시맨틱 role 로 대체 — 스킨(--og-icon-corner) 결합, 글리프 SSOT 단일화.
  const eye = document.createElement('button');
  eye.title = '클릭하면 원문 표시';
  eye.setAttribute('aria-label', '마스킹 해제');
  eye.innerHTML = iconRegistry.render('mask.reveal', { size: 13 }) as string;
  eye.style.cssText =
    'flex-shrink:0;background:none;border:none;cursor:pointer;' +
    `color:#c0c0c0;padding:1px 2px;line-height:0;border-radius:${defaultAppearance.radius(3)};` +
    'display:flex;align-items:center;';

  eye.addEventListener('mouseover', () => {
    eye.style.color = 'var(--og-primary,#1976d2)';
    eye.style.background = 'rgba(25,118,210,0.08)';
  });
  eye.addEventListener('mouseout', () => {
    eye.style.color = '#c0c0c0';
    eye.style.background = 'none';
  });

  eye.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    // DOM 즉시 교체 — 재렌더 없이 원문 표시
    text.textContent = original;
    text.style.fontFamily = '';
    text.style.letterSpacing = '';
    text.style.color = '';
    eye.remove();
    // 재렌더 시에도 해제 유지: 컬럼 내부 상태에 기록
    ((col as any)._maskRevealedRows as Set<number> | undefined ??
      (((col as any)._maskRevealedRows = new Set<number>()) as Set<number>)).add(rowIndex);
  });

  wrap.appendChild(text);
  wrap.appendChild(eye);
  return wrap;
}

// ─── TextRenderer ────────────────────────────────────────
export class TextRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const span = document.createElement('span');
    span.className = 'og-cell-text';
    // formula 우선 평가
    const formulaResult = resolveFormula(ctx);
    if (formulaResult !== null) {
      span.textContent = formulaResult;
      span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;';
      return span;
    }
    const { value, column, rowIndex } = ctx;

    if (ctx.displayValue != null) {
      span.textContent = ctx.displayValue;
      span.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;";
      return span;
    }

    let displayText: string;
    if (column.valueMap && value != null && column.valueMap[value]) {
      displayText = column.valueMap[value]!;
    } else {
      displayText = value == null ? '' : String(value);
    }

    // F5: 마스킹 처리
    // 컬럼 전체 해제(_maskRevealed) 또는 해당 행 해제(_maskRevealedRows) 시 원문 표시
    if (column.mask) {
      const colRevealed = (column as any)._maskRevealed === true;
      const rowRevealed = ((column as any)._maskRevealedRows as Set<number> | undefined)?.has(rowIndex) === true;
      if (!colRevealed && !rowRevealed) {
        return _renderMasked(displayText, column, rowIndex);
      }
    }

    span.textContent = displayText;
    span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;';
    return span;
  }
}

// ─── SelectRenderer ───────────────────────────────────────
export class SelectRenderer implements CellRenderer {
  private _opts: Array<{ label: string; value: any }>;
  private _fn: ((row: any, ri: number) => Array<{ label?: string; text?: string; value: any }>) | null;

  constructor(
    opts: Array<{ label?: string; text?: string; value: any }> = [],
    fn?: (row: any, ri: number) => Array<{ label?: string; text?: string; value: any }>
  ) {
    this._opts = opts.map(o =>
      typeof o === 'string' ? { label: o, value: o }
        : { label: (o as any).label ?? (o as any).text ?? String((o as any).value ?? ''), value: (o as any).value }
    );
    this._fn = fn ?? null;
  }

  render(ctx: RenderContext): HTMLElement {
    const span = document.createElement('span');
    span.className = 'og-cell-text';
    span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;';
    const rawVal = ctx.value;
    if (rawVal == null || rawVal === '') return span;
    const vs = String(rawVal);
    const list = this._fn
      ? this._fn(ctx.row, ctx.rowIndex).map((o: any) =>
          typeof o === 'string' ? { label: o, value: o }
            : { label: o.label ?? o.text ?? String(o.value ?? ''), value: o.value })
      : this._opts;
    const found = list.find(o => String(o.value) === vs);
    span.textContent = found ? found.label : vs;
    return span;
  }
}

// ─── NumberRenderer ───────────────────────────────────────
export class NumberRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const span = document.createElement('span');
    span.className = 'og-cell-number';
    // formula 우선 평가 (OGDecimal 고정밀도)
    const formulaResult = resolveFormula(ctx);
    if (formulaResult !== null) {
      span.textContent = formulaResult;
      span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;width:100%;text-align:right;';
      return span;
    }
    // R1b: displayFormatter 전략을 ctx.value 위에 per-instance 적용(과거 모듈전역 경로의 정확한 대체).
    //      전략만 적용(getDisplayValue override 아님) · ctx.value 사용(그룹/트리모드 정합) · null이면 기본포맷 폴백.
    if (ctx.displayFormatter) {
      const custom = ctx.displayFormatter(ctx.value, ctx.column.field ?? '', ctx.row);
      if (custom != null) {
        span.textContent = custom;
        span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;width:100%;text-align:right;';
        return span;
      }
    }
    // format 미지정 시 기본 천단위 콤마 (#,##0). precision 있으면 F4 epsilon round 적용.
    // currency(ISO 통화코드) 지정 시 Intl 로케일 통화 포맷 우선.
    span.textContent = formatNumber(ctx.value, ctx.column.format ?? '#,##0', ctx.column.precision, ctx.column.currency, ctx.column.field, ctx.row);
    span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;width:100%;text-align:right;';
    return span;
  }
}

// ─── DateRenderer ─────────────────────────────────────────
export class DateRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const span = document.createElement('span');
    span.className = 'og-cell-date';
    // R1b: displayFormatter 전략을 ctx.value 위에 per-instance 적용(전역 없이 멀티그리드 격리, 그룹모드 정합).
    const dfCustom = ctx.displayFormatter ? ctx.displayFormatter(ctx.value, ctx.column.field ?? '', ctx.row) : null;
    if (dfCustom != null) {
      span.textContent = dfCustom;
    } else {
      span.textContent = formatDate(ctx.value, ctx.column.format, ctx.column.field, ctx.row);
    }
    span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;';
    return span;
  }
}

// ─── CheckboxRenderer ─────────────────────────────────────
export class CheckboxRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'og-cell-checkbox';
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!ctx.value;
    chk.disabled = true;   // 클릭은 셀 이벤트로 처리 (_handleCellClick → writeCell)
    chk.style.cssText += 'cursor:pointer;pointer-events:none;';
    wrap.appendChild(chk);
    return wrap;
  }
}

// ─── ButtonRenderer ───────────────────────────────────────
export interface ButtonRendererDef {
  type: 'button';
  label?: string | ((value: any, row: any) => string);
  /** R12c: 라벨과 함께 표시할 아이콘 role/key(renderIcon). 미지정 시 라벨만(기존과 동일). */
  icon?: string;
  /** 아이콘 위치(기본 'left'). */
  iconPos?: 'left' | 'right';
  buttonClass?: string;
  style?: string;
}

export class ButtonRenderer implements CellRenderer {
  constructor(private def?: ButtonRendererDef) {}

  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;';
    const btn = document.createElement('button');
    btn.className = `og-cell-btn${this.def?.buttonClass ? ' ' + this.def.buttonClass : ''}`;
    const label = this.def?.label;
    const labelText = (typeof label === 'function') ? label(ctx.value, ctx.row) : (label ?? String(ctx.value ?? 'btn'));
    btn.style.cssText = `
      padding:2px 10px;border:1px solid var(--og-primary,#1976d2);
      border-radius:4px;background:var(--og-row-bg,#fff);color:var(--og-primary,#1976d2);
      cursor:pointer;font-size:12px;white-space:nowrap;transition:background 0.12s;
      ${this.def?.style ?? ''}
    `;
    if (this.def?.icon) {
      // R12c: 아이콘 + 라벨. 라벨은 textContent(안전), 아이콘은 iconRegistry SVG. 스킨 --og-icon-* 토큰 추종.
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '4px';
      const ic = document.createElement('span');
      ic.style.cssText = 'display:inline-flex;flex-shrink:0;';
      ic.innerHTML = iconRegistry.render(this.def.icon, { size: 13 }) as string;
      const tx = document.createElement('span');
      tx.textContent = labelText;
      if (this.def.iconPos === 'right') { btn.appendChild(tx); btn.appendChild(ic); }
      else { btn.appendChild(ic); btn.appendChild(tx); }
    } else {
      btn.textContent = labelText;
    }
    btn.addEventListener('mouseover', () => btn.style.background = 'var(--og-primary-light,#e3f2fd)');
    btn.addEventListener('mouseout',  () => btn.style.background = 'var(--og-row-bg,#fff)');
    wrap.appendChild(btn);
    return wrap;
  }
}

// ─── BadgeRenderer (상태/태그 표시용) ─────────────────────
export class BadgeRenderer implements CellRenderer {
  constructor(
    private colorMap?: Record<string, string>,
    private labelMap?: Record<string, string>,
  ) {}

  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;height:100%;';
    const badge = document.createElement('span');
    const val = ctx.value == null ? '' : String(ctx.value);
    // labelMap이 있으면 표시 텍스트 변환, 없으면 column.valueMap → 원값 순으로 사용
    const label = this.labelMap?.[val] ?? ctx.column.valueMap?.[val] ?? val;
    badge.textContent = label;
    const color = this.colorMap?.[val] ?? '#666';
    badge.style.cssText = `
      display:inline-block;padding:2px 8px;border-radius:${defaultAppearance.radius(12)};font-size:11px;
      background:${color}22;color:${color};border:1px solid ${color}66;
      white-space:nowrap;
    `;
    wrap.appendChild(badge);
    return wrap;
  }
}

// ─── LinkRenderer ─────────────────────────────────────────
export class LinkRenderer implements CellRenderer {
  constructor(
    private hrefFn?: (value: any, row: any) => string,
    private target?: string,
  ) {}

  render(ctx: RenderContext): HTMLElement {
    const a = document.createElement('a');
    a.className = 'og-cell-link';
    a.textContent = ctx.value == null ? '' : String(ctx.value);
    a.href = this.hrefFn ? this.hrefFn(ctx.value, ctx.row) : '#';
    if (this.target) a.target = this.target;
    a.style.cssText = 'color:var(--og-primary,#1976d2);text-decoration:underline;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;';
    if (!this.hrefFn) a.addEventListener('click', e => e.preventDefault());
    return a;
  }
}

// ─── TemplateRenderer (사용자 정의 HTML) ──────────────────
export class TemplateRenderer implements CellRenderer {
  constructor(private templateFn: (value: any, row: any, rowIndex: number) => string) {}

  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'og-cell-template';
    wrap.style.cssText = 'display:flex;align-items:center;height:100%;overflow:hidden;';
    wrap.innerHTML = this.templateFn(ctx.value, ctx.row, ctx.rowIndex);
    return wrap;
  }
}

// ─── ImageRenderer ────────────────────────────────────────
export interface ImageRendererDef {
  type: 'image';
  width?: number;
  height?: number;
  radius?: number;
  srcFn?: (value: any, row: any) => string;
  alt?: string | ((value: any, row: any) => string);
}

export class ImageRenderer implements CellRenderer {
  constructor(private def?: ImageRendererDef) {}

  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;';
    const img = document.createElement('img');
    const src = this.def?.srcFn ? this.def.srcFn(ctx.value, ctx.row) : String(ctx.value ?? '');
    img.src = src;
    const w = this.def?.width ?? 28;
    const h = this.def?.height ?? 28;
    const r = this.def?.radius ?? 4;
    img.style.cssText = `width:${w}px;height:${h}px;object-fit:cover;border-radius:${defaultAppearance.radius(r)};display:block;`;
    const alt = this.def?.alt;
    img.alt = typeof alt === 'function' ? alt(ctx.value, ctx.row) : (alt ?? '');
    img.onerror = () => { img.style.display = 'none'; };
    wrap.appendChild(img);
    return wrap;
  }
}

// ─── ProgressRenderer ─────────────────────────────────────
export interface ProgressRendererDef {
  type: 'progress';
  max?: number;
  color?: string;
  showLabel?: boolean;
  colorFn?: (value: number) => string;
}

export class ProgressRenderer implements CellRenderer {
  constructor(private def?: ProgressRendererDef) {}

  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;gap:5px;width:100%;padding:0 4px;box-sizing:border-box;';
    const max = this.def?.max ?? 100;
    const raw = Number(ctx.value) || 0;
    const pct = Math.min(100, Math.max(0, (raw / max) * 100));
    const color = this.def?.colorFn
      ? this.def.colorFn(raw)
      : (this.def?.color ?? 'var(--og-primary,#1976d2)');

    const track = document.createElement('div');
    track.className = 'og-progress-track';
    track.style.cssText = `flex:1;height:10px;background:#e0e0e0;border-radius:${defaultAppearance.radius(5)};overflow:hidden;`;
    const fill = document.createElement('div');
    fill.className = 'og-progress-fill';
    fill.style.cssText = `width:${pct}%;height:100%;background:${color};border-radius:${defaultAppearance.radius(5)};`;
    track.appendChild(fill);
    wrap.appendChild(track);

    if (this.def?.showLabel !== false) {
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:11px;color:#666;white-space:nowrap;min-width:28px;text-align:right;';
      lbl.textContent = `${Math.round(pct)}%`;
      wrap.appendChild(lbl);
    }
    return wrap;
  }
}

// ─── SparklineRenderer (인라인 미니 차트) ─────────────────
export interface SparklineRendererDef {
  type: 'sparkline';
  width?: number;
  height?: number;
  color?: string;
  chartType?: 'bar' | 'line' | 'area';
}

export class SparklineRenderer implements CellRenderer {
  constructor(private def?: SparklineRendererDef) {}

  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;';

    const values: number[] = Array.isArray(ctx.value) ? ctx.value.map(Number) : [];
    if (!values.length) {
      wrap.textContent = '-';
      return wrap;
    }

    const W = this.def?.width ?? 80;
    const H = this.def?.height ?? 22;
    const color = this.def?.color ?? '#1976d2';
    const chartType = this.def?.chartType ?? 'bar';

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = 'display:block;';

    const c = canvas.getContext('2d');
    if (c) {
      const max = Math.max(...values, 1);
      const min = Math.min(...values, 0);
      const range = max - min || 1;
      const n = values.length;

      if (chartType === 'bar') {
        const bw = W / n;
        values.forEach((v, i) => {
          const bh = ((v - min) / range) * (H - 2);
          c.fillStyle = color;
          c.fillRect(i * bw + 1, H - bh - 1, bw - 2, bh);
        });
      } else {
        const pts = values.map((v, i) => ({
          x: (i / (n - 1 || 1)) * W,
          y: H - ((v - min) / range) * (H - 4) - 2,
        }));
        if (chartType === 'area') {
          c.fillStyle = color + '33';
          c.beginPath();
          c.moveTo(pts[0]!.x, H);
          pts.forEach(p => c.lineTo(p.x, p.y));
          c.lineTo(pts[pts.length - 1]!.x, H);
          c.closePath();
          c.fill();
        }
        c.strokeStyle = color;
        c.lineWidth = 1.5;
        c.beginPath();
        pts.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
        c.stroke();
      }
    }

    wrap.appendChild(canvas);
    return wrap;
  }
}

// ─── SwitchRenderer (토글 스위치 표시) ───────────────────
export class SwitchRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;';
    const on = !!ctx.value;
    const sw = document.createElement('span');
    sw.className = 'og-switch' + (on ? ' og-switch--on' : '');
    sw.style.cssText = `display:inline-block;width:34px;height:18px;border-radius:${defaultAppearance.radius(9)};
      background:${on ? 'var(--og-primary,#1976d2)' : '#bdbdbd'};
      position:relative;transition:background 0.2s;cursor:pointer;flex-shrink:0;pointer-events:none;`;
    const knob = document.createElement('span');
    knob.style.cssText = `position:absolute;top:2px;left:${on ? '16px' : '2px'};
      width:14px;height:14px;border-radius:50%;background:#fff;
      transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
    sw.appendChild(knob);
    wrap.appendChild(sw);
    return wrap;
  }
}

// ─── RatingRenderer (별점 표시) ───────────────────────────
export interface RatingRendererDef {
  type: 'rating';
  max?: number;
  color?: string;
}

export class RatingRenderer implements CellRenderer {
  constructor(private def?: RatingRendererDef) {}

  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;gap:1px;height:100%;';
    const max = this.def?.max ?? 5;
    const val = Math.round(Number(ctx.value) || 0);
    const color = this.def?.color ?? '#ffa000';
    for (let i = 1; i <= max; i++) {
      const star = document.createElement('span');
      star.textContent = '★';
      star.style.cssText = `font-size:14px;color:${i <= val ? color : '#e0e0e0'};line-height:1;`;
      wrap.appendChild(star);
    }
    return wrap;
  }
}

// ─── RadioRenderer ────────────────────────────────────────
export class RadioRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;pointer-events:none;';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.checked = !!ctx.value;
    radio.setAttribute('aria-checked', ctx.value ? 'true' : 'false');
    radio.setAttribute('aria-label', ctx.column.header ?? '선택');
    if (ctx.column.group) radio.name = `og-radio-${ctx.rowIndex}-${ctx.column.group}`;
    radio.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:var(--og-primary,#1976d2);';
    wrap.appendChild(radio);
    return wrap;
  }
}

// ─── ImgRenderer ──────────────────────────────────────────
export class ImgRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;overflow:hidden;';
    if (!ctx.value) return wrap;
    const img = document.createElement('img');
    img.src = String(ctx.value);
    img.alt = (ctx.column as any).alt ?? ctx.column.field;
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;';
    img.setAttribute('role', 'img');
    wrap.appendChild(img);
    return wrap;
  }
}

// ─── HtmlRenderer ─────────────────────────────────────────
function _sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script,iframe,object,embed').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    }
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? '';
      if (/^javascript:/i.test(href)) el.removeAttribute('href');
    }
  });
  return div.innerHTML;
}

export class HtmlRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:block;overflow:hidden;width:100%;';
    const doSanitize = (ctx.column as any).sanitize !== false;
    const html = String(ctx.value ?? '');
    wrap.innerHTML = doSanitize ? _sanitizeHtml(html) : html;
    return wrap;
  }
}

// ─── BarcodeRenderer (Code128B) ───────────────────────────
const _C128W: string[] = [
  '212222','222122','222221','121223','121322','131222','122213','122312', // 0-7
  '132212','221213','221312','231212','112232','122132','122231','113222', // 8-15
  '123122','123221','223211','221132','221231','213212','223112','312131', // 16-23
  '311222','321122','321221','312212','322112','322211','212123','212321', // 24-31
  '232121','111323','131123','131321','112313','132113','132311','211313', // 32-39
  '231113','231311','112133','112331','132131','113123','113321','133121', // 40-47
  '313121','211331','231131','213113','213311','213131','311123','311321', // 48-55
  '331121','312113','312311','332111','314111','221411','431111','111224', // 56-63
  '111422','121124','121421','141122','141221','112214','112412','122114', // 64-71
  '122411','142112','142211','241211','221114','413111','241112','134111', // 72-79
  '111242','121142','121241','114212','124112','124211','411212','421112', // 80-87
  '421211','212141','214121','412121','111143','111341','131141','114113', // 88-95
  '114311','411113','411311','113141','114131','311141','411131','211412', // 96-103
  '211214','211232', // 104 (Start B), 105 (Start C)
];
const _C128_STOP = '2331112';

function _c128Bits(w: string): string {
  let out = '', bar = true;
  for (const ch of w) { out += (bar ? '1' : '0').repeat(+ch); bar = !bar; }
  return out;
}

function _encodeC128B(text: string): string {
  const codes: number[] = [104]; // Start B
  for (const ch of text) {
    const c = ch.charCodeAt(0) - 32;
    if (c >= 0 && c <= 94) codes.push(c);
  }
  let sum = 104;
  for (let i = 1; i < codes.length; i++) sum += codes[i]! * i;
  codes.push(sum % 103);
  return codes.map(c => _c128Bits(_C128W[c]!)).join('') + _c128Bits(_C128_STOP) + '11';
}

export class BarcodeRenderer implements CellRenderer {
  render(ctx: RenderContext): HTMLElement {
    const val = String(ctx.value ?? '');
    const h = (ctx.column as any).barcodeHeight ?? 28;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;overflow:hidden;gap:1px;';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `바코드: ${val}`);
    wrap.innerHTML = _barcodeSvg(val, h);
    const label = document.createElement('span');
    label.textContent = val;
    label.style.cssText = 'font-size:9px;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;';
    wrap.appendChild(label);
    return wrap;
  }
}

function _barcodeSvg(text: string, H: number): string {
  if (!text) return '';
  const bits = _encodeC128B(text);
  const MW = 1.4, QZ = 6;
  const TW = bits.length * MW + QZ * 2;
  const rects: string[] = [];
  let i = 0, x = QZ;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let n = 0;
      while (i + n < bits.length && bits[i + n] === '1') n++;
      rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${(n * MW).toFixed(2)}" height="${H}"/>`);
      x += n * MW; i += n;
    } else { x += MW; i++; }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TW.toFixed(2)} ${H}" width="${TW.toFixed(2)}" height="${H}" style="display:block" aria-hidden="true"><g fill="currentColor">${rects.join('')}</g></svg>`;
}

// ─── Renderer 레지스트리 (R10, OCP — Replace Conditional with Registry) ──────
/**
 * R10(§6-R10, §2.5 R-4c, §3.1 C11): `createRenderer` 이중 switch 를 `Map<typeName, factory>`
 * 레지스트리로 대체한다. 내장 타입은 모듈 로드시 부트스트랩 등록(아래 switch 와 동일 매핑),
 * `createRenderer` 는 레지스트리로 해석하고 미등록 타입은 기존과 동일하게 TextRenderer 로 폴백한다.
 * `registerRenderer(typeName, factory)` 로 코어 편집 없이 커스텀 렌더러를 추가할 수 있다(OCP).
 *
 * 등록은 **프로세스 전역**(내장은 불변에 가깝고, 커스텀 등록은 defaultOverride 와 동형의 전역 정책).
 * 인스턴스별 스코핑은 R11/R12(ExtensionPointRegistry)의 후속 작업으로 남긴다.
 *
 * 팩토리는 `(col, def)` 를 받는다. `def` 는 RendererDef 객체 경로에서만 채워지며(문자열/col.type
 * 경로에서는 undefined), 원 switch 의 세 컨텍스트(col.type / 문자열 / 객체) 동작을 정확히 보존한다:
 *  - image/progress/sparkline/rating/template 은 def(설정 객체) 없이는 원래 TextRenderer 로 떨어졌으므로
 *    def 유무로 게이트한다(문자열 렌더러명만 준 미완성 설정 = 기존과 동일 폴백).
 */
export type RendererFactory = (col: ColumnDef, def?: RendererDef) => CellRenderer;

const _rendererRegistry = new Map<string, RendererFactory>();

/** 커스텀 셀 렌더러 타입을 코어 편집 없이 등록(OCP). 프로세스 전역. */
export function registerRenderer(typeName: string, factory: RendererFactory): void {
  _rendererRegistry.set(typeName, factory);
}

/** 등록 여부 조회(내부/테스트용). */
export function hasRenderer(typeName: string): boolean {
  return _rendererRegistry.has(typeName);
}

// 내장 타입 부트스트랩 등록 — 원 switch 3 컨텍스트의 합집합(동작 동일).
registerRenderer('number',    () => new NumberRenderer());
registerRenderer('date',      () => new DateRenderer());
registerRenderer('boolean',   () => new CheckboxRenderer());
registerRenderer('checkbox',  () => new CheckboxRenderer());
registerRenderer('radio',     () => new RadioRenderer());
registerRenderer('img',       () => new ImgRenderer());
registerRenderer('html',      () => new HtmlRenderer());
registerRenderer('barcode',   () => new BarcodeRenderer());
registerRenderer('switch',    () => new SwitchRenderer());
registerRenderer('select',    (col) => new SelectRenderer(col.options as any ?? [], col.optionsFn as any));
registerRenderer('button',    (_col, def) => new ButtonRenderer(def as ButtonRendererDef | undefined));
registerRenderer('link',      (_col, def) => new LinkRenderer(def?.hrefFn, def?.target));
registerRenderer('badge',     (_col, def) => new BadgeRenderer(def?.colorMap, def ? (def.labelMap ?? def.valueMap) : undefined));
// 아래 4종 + template 은 설정 객체(def)가 있어야 의미가 있다 → def 없으면 원 switch 처럼 TextRenderer 폴백.
registerRenderer('image',     (_col, def) => def ? new ImageRenderer(def as ImageRendererDef) : new TextRenderer());
registerRenderer('progress',  (_col, def) => def ? new ProgressRenderer(def as ProgressRendererDef) : new TextRenderer());
registerRenderer('sparkline', (_col, def) => def ? new SparklineRenderer(def as SparklineRendererDef) : new TextRenderer());
registerRenderer('rating',    (_col, def) => def ? new RatingRenderer(def as RatingRendererDef) : new TextRenderer());
registerRenderer('template',  (_col, def) => def ? new TemplateRenderer(def.templateFn) : new TextRenderer());

// ─── Renderer 팩토리 ──────────────────────────────────────
export function createRenderer(col: ColumnDef): CellRenderer {
  const renderer = col.renderer;
  let name: string;
  let def: RendererDef | undefined;
  if (!renderer)                     { name = String(col.type ?? ''); def = undefined; }
  else if (typeof renderer === 'string') { name = renderer;               def = undefined; }
  else                               { name = renderer.type;         def = renderer; }
  const factory = _rendererRegistry.get(name);
  return factory ? factory(col, def) : new TextRenderer();
}
