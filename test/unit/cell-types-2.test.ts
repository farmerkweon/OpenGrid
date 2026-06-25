import { describe, it, expect } from 'vitest';
import {
  RadioRenderer, ImgRenderer, HtmlRenderer, BarcodeRenderer,
  createRenderer,
} from '../../src/core/renderers/CellRenderer.js';
import type { RenderContext } from '../../src/core/renderers/CellRenderer.js';
import type { ColumnDef } from '../../src/core/types.js';

function ctx(value: any, col?: Partial<ColumnDef>, rowIndex = 0): RenderContext {
  return {
    value, row: {}, rowIndex,
    column: { field: 'f', header: '테스트', ...col } as ColumnDef,
    colIndex: 0, isSelected: false, rowState: 'none',
  };
}

// ─── RadioRenderer ──────────────────────────────────────────
describe('RadioRenderer (Sprint 37)', () => {
  it('checked=true 일 때 radio input이 checked', () => {
    const r = new RadioRenderer();
    const el = r.render(ctx(true));
    const radio = el.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(radio).not.toBeNull();
    expect(radio.checked).toBe(true);
  });

  it('checked=false 일 때 unchecked', () => {
    const r = new RadioRenderer();
    const el = r.render(ctx(false));
    const radio = el.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(radio.checked).toBe(false);
  });

  it('group 있으면 name 속성 설정', () => {
    const r = new RadioRenderer();
    const el = r.render(ctx(false, { group: 'priority' }, 2));
    const radio = el.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(radio.name).toBe('og-radio-2-priority');
  });

  it('aria-checked 속성 설정', () => {
    const r = new RadioRenderer();
    const el = r.render(ctx(true));
    const radio = el.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(radio.getAttribute('aria-checked')).toBe('true');
  });

  it('pointer-events:none — 부모 컨테이너에 적용', () => {
    const r = new RadioRenderer();
    const el = r.render(ctx(false));
    expect(el.style.pointerEvents).toBe('none');
  });

  it("createRenderer — type:'radio' → RadioRenderer", () => {
    expect(createRenderer({ field: 'f', header: 'h', type: 'radio' as any })).toBeInstanceOf(RadioRenderer);
  });
});

// ─── ImgRenderer ─────────────────────────────────────────────
describe('ImgRenderer (Sprint 37)', () => {
  it('src 값이 img.src에 반영', () => {
    const r = new ImgRenderer();
    const el = r.render(ctx('https://example.com/img.png'));
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/img.png');
  });

  it('col.alt가 img.alt에 반영', () => {
    const r = new ImgRenderer();
    const el = r.render(ctx('img.png', { alt: '상품 이미지' } as any));
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img.alt).toBe('상품 이미지');
  });

  it('alt 없으면 field명 사용', () => {
    const r = new ImgRenderer();
    const el = r.render(ctx('img.png', { field: 'photo' }));
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img.alt).toBe('photo');
  });

  it('값이 null이면 빈 span', () => {
    const r = new ImgRenderer();
    const el = r.render(ctx(null));
    expect(el.querySelector('img')).toBeNull();
  });

  it('role=img 설정', () => {
    const r = new ImgRenderer();
    const el = r.render(ctx('img.png'));
    expect(el.querySelector('img')?.getAttribute('role')).toBe('img');
  });

  it("createRenderer — type:'img' → ImgRenderer", () => {
    expect(createRenderer({ field: 'f', header: 'h', type: 'img' as any })).toBeInstanceOf(ImgRenderer);
  });
});

// ─── HtmlRenderer ────────────────────────────────────────────
describe('HtmlRenderer (Sprint 37)', () => {
  it('HTML 마크업 렌더링', () => {
    const r = new HtmlRenderer();
    const el = r.render(ctx('<b>강조</b>'));
    expect(el.querySelector('b')?.textContent).toBe('강조');
  });

  it('script 태그 제거 (sanitize)', () => {
    const r = new HtmlRenderer();
    const el = r.render(ctx('<script>alert(1)</script><span>안전</span>'));
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('span')?.textContent).toBe('안전');
  });

  it('onclick 이벤트 속성 제거 (sanitize)', () => {
    const r = new HtmlRenderer();
    const el = r.render(ctx('<div onclick="evil()">텍스트</div>'));
    const div = el.querySelector('div');
    expect(div?.getAttribute('onclick')).toBeNull();
  });

  it('javascript: href 제거', () => {
    const r = new HtmlRenderer();
    const el = r.render(ctx('<a href="javascript:void(0)">링크</a>'));
    const a = el.querySelector('a');
    expect(a?.getAttribute('href')).toBeNull();
  });

  it('sanitize:false 이면 원본 HTML 유지 (스크립트 포함)', () => {
    const r = new HtmlRenderer();
    const el = r.render(ctx('<b>raw</b>', { sanitize: false } as any));
    expect(el.querySelector('b')?.textContent).toBe('raw');
  });

  it("createRenderer — type:'html' → HtmlRenderer", () => {
    expect(createRenderer({ field: 'f', header: 'h', type: 'html' as any })).toBeInstanceOf(HtmlRenderer);
  });
});

// ─── BarcodeRenderer (Code128B) ──────────────────────────────
describe('BarcodeRenderer (Sprint 37)', () => {
  it('SVG 요소가 렌더링됨', () => {
    const r = new BarcodeRenderer();
    const el = r.render(ctx('ABC123'));
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('바코드 아래 텍스트 레이블 표시', () => {
    const r = new BarcodeRenderer();
    const el = r.render(ctx('HELLO'));
    expect(el.textContent).toContain('HELLO');
  });

  it('빈 값이면 SVG 없음', () => {
    const r = new BarcodeRenderer();
    const el = r.render(ctx(''));
    expect(el.querySelector('svg')).toBeNull();
  });

  it('SVG에 rect(바 요소)가 포함됨', () => {
    const r = new BarcodeRenderer();
    const el = r.render(ctx('1234'));
    const rects = el.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThan(10); // Code128B 최소 20개 이상
  });

  it('aria-label에 바코드 값 포함', () => {
    const r = new BarcodeRenderer();
    const el = r.render(ctx('XYZ'));
    expect(el.getAttribute('aria-label')).toContain('XYZ');
  });

  it('barcodeHeight 옵션 반영', () => {
    const r = new BarcodeRenderer();
    const el = r.render(ctx('TEST', { barcodeHeight: 40 } as any));
    const svg = el.querySelector('svg');
    expect(Number(svg?.getAttribute('height'))).toBe(40);
  });

  it("createRenderer — type:'barcode' → BarcodeRenderer", () => {
    expect(createRenderer({ field: 'f', header: 'h', type: 'barcode' as any })).toBeInstanceOf(BarcodeRenderer);
  });

  it('renderer:"barcode" 문자열 지정도 동작', () => {
    expect(createRenderer({ field: 'f', header: 'h', renderer: 'barcode' as any })).toBeInstanceOf(BarcodeRenderer);
  });
});
