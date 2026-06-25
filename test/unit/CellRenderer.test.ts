import { describe, it, expect } from 'vitest';
import {
  TextRenderer, NumberRenderer, DateRenderer, CheckboxRenderer,
  BadgeRenderer, LinkRenderer, TemplateRenderer,
  formatNumber, formatDate, createRenderer,
} from '../../src/core/renderers/CellRenderer.js';
import type { RenderContext } from '../../src/core/renderers/CellRenderer.js';
import type { ColumnDef } from '../../src/core/types.js';

function ctx(value: any, extra: Partial<RenderContext> = {}): RenderContext {
  return {
    value,
    row: {},
    rowIndex: 0,
    column: { field: 'f', header: 'H' } as ColumnDef,
    colIndex: 0,
    isSelected: false,
    rowState: 'none',
    ...extra,
  };
}

// ─── formatNumber ───────────────────────────────────────────
describe('formatNumber', () => {
  it('null/empty → ""', () => expect(formatNumber(null)).toBe(''));
  it('숫자 포맷 없음 → 문자열', () => expect(formatNumber(42)).toBe('42'));
  it('#,##0 포맷 → 천단위', () => {
    const result = formatNumber(1234567, '#,##0');
    expect(result).toMatch(/1[,.]234[,.]567/); // locale depends
  });
  it('소수점 포맷', () => expect(formatNumber(3.14159, '#,##0.00')).toContain('.'));
  it('비숫자 → 원본 문자열', () => expect(formatNumber('abc')).toBe('abc'));
});

// ─── formatDate ────────────────────────────────────────────
describe('formatDate', () => {
  it('null → ""', () => expect(formatDate(null)).toBe(''));
  it('Date 객체 포맷', () => {
    const d = new Date(2024, 0, 15); // Jan 15
    expect(formatDate(d)).toBe('2024-01-15');
  });
  it('문자열 날짜 파싱', () => expect(formatDate('2024-06-30')).toBe('2024-06-30'));
  it('커스텀 포맷', () => {
    expect(formatDate(new Date(2024, 11, 3), 'yyyy/MM/dd')).toBe('2024/12/03');
  });
});

// ─── TextRenderer ──────────────────────────────────────────
describe('TextRenderer', () => {
  const r = new TextRenderer();
  it('기본 텍스트 렌더링', () => {
    const el = r.render(ctx('hello'));
    expect(el.textContent).toBe('hello');
    expect(el.className).toBe('og-cell-text');
  });
  it('null → 빈 문자열', () => expect(r.render(ctx(null)).textContent).toBe(''));
  it('valueMap 적용', () => {
    const el = r.render(ctx('1', {
      column: { field: 'f', header: 'H', valueMap: { '1': '활성' } } as ColumnDef,
    }));
    expect(el.textContent).toBe('활성');
  });
});

// ─── NumberRenderer ────────────────────────────────────────
describe('NumberRenderer', () => {
  it('숫자 렌더링', () => {
    const el = new NumberRenderer().render(ctx(1234));
    expect(el.textContent).toBe('1,234');
    expect(el.className).toBe('og-cell-number');
  });
});

// ─── DateRenderer ──────────────────────────────────────────
describe('DateRenderer', () => {
  it('날짜 렌더링', () => {
    const el = new DateRenderer().render(ctx('2024-03-15'));
    expect(el.textContent).toBe('2024-03-15');
    expect(el.className).toBe('og-cell-date');
  });
});

// ─── CheckboxRenderer ──────────────────────────────────────
describe('CheckboxRenderer', () => {
  it('true → checked', () => {
    const el = new CheckboxRenderer().render(ctx(true));
    const chk = el.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(chk?.checked).toBe(true);
    expect(chk?.disabled).toBe(true);
  });
  it('false → unchecked', () => {
    const chk = new CheckboxRenderer().render(ctx(false))
      .querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(chk?.checked).toBe(false);
  });
});

// ─── BadgeRenderer ─────────────────────────────────────────
describe('BadgeRenderer', () => {
  it('값 텍스트 렌더링', () => {
    const el = new BadgeRenderer({ active: '#00aa00' }).render(ctx('active'));
    const badge = el.querySelector('span') as HTMLElement;
    expect(badge?.textContent).toBe('active');
    // jsdom은 CSS 색상을 rgb()로 정규화함
    expect(badge?.style.color).toMatch(/rgb\(0,\s*170,\s*0\)|#00aa00/);
  });
});

// ─── LinkRenderer ──────────────────────────────────────────
describe('LinkRenderer', () => {
  it('기본 링크 (#)', () => {
    const a = new LinkRenderer().render(ctx('Google')) as HTMLAnchorElement;
    expect(a.textContent).toBe('Google');
    expect(a.href).toMatch(/#$/);  // jsdom 환경에서 href = baseURL + '#'
  });
  it('hrefFn 적용', () => {
    const a = new LinkRenderer((v) => `https://example.com/${v}`)
      .render(ctx('page')) as HTMLAnchorElement;
    expect(a.href).toContain('example.com/page');
  });
});

// ─── TemplateRenderer ──────────────────────────────────────
describe('TemplateRenderer', () => {
  it('innerHTML 삽입', () => {
    const el = new TemplateRenderer((v) => `<b>${v}</b>`).render(ctx('bold'));
    expect(el.innerHTML).toBe('<b>bold</b>');
  });
});

// ─── createRenderer 팩토리 ──────────────────────────────────
describe('createRenderer 팩토리', () => {
  it('타입 없음 → TextRenderer', () => {
    expect(createRenderer({ field: 'f', header: 'h' })).toBeInstanceOf(TextRenderer);
  });
  it('type:number → NumberRenderer', () => {
    expect(createRenderer({ field: 'f', header: 'h', type: 'number' })).toBeInstanceOf(NumberRenderer);
  });
  it('type:date → DateRenderer', () => {
    expect(createRenderer({ field: 'f', header: 'h', type: 'date' })).toBeInstanceOf(DateRenderer);
  });
  it('type:boolean → CheckboxRenderer', () => {
    expect(createRenderer({ field: 'f', header: 'h', type: 'boolean' })).toBeInstanceOf(CheckboxRenderer);
  });
  it('renderer:"link" → LinkRenderer', () => {
    expect(createRenderer({ field: 'f', header: 'h', renderer: 'link' })).toBeInstanceOf(LinkRenderer);
  });
  it('renderer 객체 template → TemplateRenderer', () => {
    const col: ColumnDef = {
      field: 'f', header: 'h',
      renderer: { type: 'template', templateFn: (v: any) => `<span>${v}</span>` },
    };
    expect(createRenderer(col)).toBeInstanceOf(TemplateRenderer);
  });
});
