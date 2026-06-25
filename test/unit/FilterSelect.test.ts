import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilterSelectPanel } from '../../src/core/FilterSelect.js';
import type { FilterSelectConfig } from '../../src/core/FilterSelect.js';

// ─── 샘플 JSON 데이터 ────────────────────────────────────────
const CAT_DATA = [
  { catCode: 'ELEC',  catName: '전자제품' },
  { catCode: 'CLOTH', catName: '의류' },
];

const BRAND_DATA = [
  { brandCode: 'SAM',  brandName: '삼성',    catCode: 'ELEC' },
  { brandCode: 'LG',   brandName: 'LG전자',  catCode: 'ELEC' },
  { brandCode: 'NIKE', brandName: '나이키',   catCode: 'CLOTH' },
  { brandCode: 'ADI',  brandName: '아디다스', catCode: 'CLOTH' },
];

const MODEL_DATA = [
  { modelCode: 'GAL', modelName: 'Galaxy',  brandCode: 'SAM' },
  { modelCode: 'NEO', modelName: 'Neo QLED', brandCode: 'SAM' },
  { modelCode: 'OLE', modelName: 'OLED TV',  brandCode: 'LG' },
];

function makeContainer(): HTMLElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  return c;
}

function makePanel(
  container: HTMLElement,
  config: FilterSelectConfig,
  onFilter = vi.fn(),
  onReset  = vi.fn(),
) {
  return new FilterSelectPanel(container, config, onFilter, onReset, 'test-grid');
}

// ─── 렌더링 기본 ─────────────────────────────────────────────
describe('FilterSelectPanel v3 — 렌더링', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });

  it('fieldset.og-filter-select 삽입됨', () => {
    makePanel(container, { columns: [{ field: 'cat', label: '카테고리' }] });
    expect(container.querySelector('fieldset.og-filter-select')).not.toBeNull();
  });

  it('legend 기본값 "필터"', () => {
    makePanel(container, { columns: [{ field: 'f', label: 'L' }] });
    expect(container.querySelector('.og-filter-select-legend')?.textContent).toBe('필터');
  });

  it('legend 커스텀 반영', () => {
    makePanel(container, { legend: '상품 검색', columns: [{ field: 'f', label: 'L' }] });
    expect(container.querySelector('.og-filter-select-legend')?.textContent).toBe('상품 검색');
  });

  it('초기화 버튼 존재', () => {
    makePanel(container, { columns: [{ field: 'f', label: 'L' }] });
    expect(container.querySelector('.og-filter-select-reset')).not.toBeNull();
  });

  it('컬럼 수만큼 select 렌더링', () => {
    makePanel(container, {
      columns: [
        { field: 'cat',   label: '카테고리' },
        { field: 'brand', label: '브랜드', dependsOn: 'cat' },
      ],
    });
    expect(container.querySelectorAll('.og-filter-select-sel').length).toBe(2);
  });
});

// ─── JSON 배열 바인딩 (valueKey / textKey) ───────────────────
describe('FilterSelectPanel v3 — JSON data 바인딩', () => {
  it('data + valueKey + textKey → value와 text가 분리됨', () => {
    const container = makeContainer();
    makePanel(container, {
      columns: [{
        field: 'cat', label: '카테고리',
        data: CAT_DATA, valueKey: 'catCode', textKey: 'catName',
      }],
    });
    const sel = container.querySelector<HTMLSelectElement>('.og-filter-select-sel')!;
    // 전체(index 0) + 2개
    expect(sel.options.length).toBe(3);
    expect(sel.options[1]!.value).toBe('ELEC');
    expect(sel.options[1]!.text).toBe('전자제품');
    expect(sel.options[2]!.value).toBe('CLOTH');
    expect(sel.options[2]!.text).toBe('의류');
  });

  it('textKey 미지정 시 valueKey로 text 대체', () => {
    const container = makeContainer();
    makePanel(container, {
      columns: [{
        field: 'cat', label: '카테고리',
        data: [{ code: 'A' }, { code: 'B' }], valueKey: 'code',
        // textKey 없음
      }],
    });
    const sel = container.querySelector<HTMLSelectElement>('.og-filter-select-sel')!;
    expect(sel.options[1]!.text).toBe('A');
    expect(sel.options[2]!.text).toBe('B');
  });

  it('첫 옵션은 항상 전체(value="")', () => {
    const container = makeContainer();
    makePanel(container, {
      columns: [{ field: 'f', label: 'L', data: CAT_DATA, valueKey: 'catCode', textKey: 'catName' }],
    });
    const sel = container.querySelector<HTMLSelectElement>('.og-filter-select-sel')!;
    expect(sel.options[0]!.value).toBe('');
    expect(sel.options[0]!.textContent).toBe('전체');
  });

  it('정적 options 배열도 지원', () => {
    const container = makeContainer();
    makePanel(container, {
      columns: [{
        field: 'status', label: '상태',
        options: [{ value: 'Y', text: '활성' }, { value: 'N', text: '비활성' }],
      }],
    });
    const sel = container.querySelector<HTMLSelectElement>('.og-filter-select-sel')!;
    expect(sel.options[1]!.value).toBe('Y');
    expect(sel.options[1]!.text).toBe('활성');
  });
});

// ─── filterKey — 그리드 필터링 기준 키 ───────────────────────
describe('FilterSelectPanel v3 — filterKey', () => {
  it('filterKey 지정 시 onFilter 호출에 filterKey 사용', () => {
    const container = makeContainer();
    const onFilter = vi.fn();
    makePanel(container, {
      columns: [{
        field: 'catFilter', label: '카테고리',
        data: CAT_DATA, valueKey: 'catCode', textKey: 'catName',
        filterKey: 'category',   // ← 그리드 행 필터 키
      }],
    }, onFilter);
    const sel = container.querySelector<HTMLSelectElement>('.og-filter-select-sel')!;
    sel.value = 'ELEC';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // 'category' 키로 필터링해야 함
    expect(onFilter).toHaveBeenCalledWith('category', [{ operator: '=', value: 'ELEC' }]);
  });

  it('filterKey 미지정 시 field를 기준 키로 사용', () => {
    const container = makeContainer();
    const onFilter = vi.fn();
    makePanel(container, {
      columns: [{
        field: 'brand', label: '브랜드',
        data: BRAND_DATA, valueKey: 'brandCode', textKey: 'brandName',
        // filterKey 없음
      }],
    }, onFilter);
    const sel = container.querySelector<HTMLSelectElement>('.og-filter-select-sel')!;
    sel.value = 'SAM';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onFilter).toHaveBeenCalledWith('brand', [{ operator: '=', value: 'SAM' }]);
  });

  it('전체 선택 시 onReset(filterKey) 호출', () => {
    const container = makeContainer();
    const onReset = vi.fn();
    makePanel(container, {
      columns: [{
        field: 'catFilter', label: '카테고리',
        data: CAT_DATA, valueKey: 'catCode', textKey: 'catName',
        filterKey: 'category',
      }],
    }, vi.fn(), onReset);
    const sel = container.querySelector<HTMLSelectElement>('.og-filter-select-sel')!;
    sel.value = 'ELEC'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    sel.value = '';     sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onReset).toHaveBeenCalledWith('category');
  });
});

// ─── 캐스케이딩 (dependsOnKey) ───────────────────────────────
describe('FilterSelectPanel v3 — 캐스케이딩', () => {
  it('dependsOn 컬럼은 초기 disabled', () => {
    const container = makeContainer();
    makePanel(container, {
      columns: [
        { field: 'cat',   label: '카테고리', data: CAT_DATA,   valueKey: 'catCode',   textKey: 'catName' },
        { field: 'brand', label: '브랜드',   data: BRAND_DATA, valueKey: 'brandCode', textKey: 'brandName',
          dependsOn: 'cat', dependsOnKey: 'catCode' },
      ],
    });
    const [catSel, brandSel] = container.querySelectorAll<HTMLSelectElement>('.og-filter-select-sel');
    expect(catSel!.disabled).toBe(false);
    expect(brandSel!.disabled).toBe(true);
  });

  it('부모 선택 → dependsOnKey로 자식 데이터 필터링 후 옵션 표시', () => {
    const container = makeContainer();
    makePanel(container, {
      columns: [
        { field: 'cat',   label: '카테고리', data: CAT_DATA,   valueKey: 'catCode',   textKey: 'catName' },
        { field: 'brand', label: '브랜드',   data: BRAND_DATA, valueKey: 'brandCode', textKey: 'brandName',
          dependsOn: 'cat', dependsOnKey: 'catCode' },
      ],
    });
    const [catSel, brandSel] = container.querySelectorAll<HTMLSelectElement>('.og-filter-select-sel');
    catSel!.value = 'ELEC';
    catSel!.dispatchEvent(new Event('change', { bubbles: true }));

    // ELEC 카테고리 브랜드만 표시
    const brandVals = [...brandSel!.options].map(o => o.value).filter(v => v !== '');
    expect(brandVals).toContain('SAM');
    expect(brandVals).toContain('LG');
    expect(brandVals).not.toContain('NIKE');  // 의류 브랜드 제외
    expect(brandSel!.disabled).toBe(false);
  });

  it('부모 선택값이 자식 onFilter에 전달됨', () => {
    const container = makeContainer();
    const onFilter = vi.fn();
    makePanel(container, {
      columns: [
        { field: 'cat',   label: '카테고리', data: CAT_DATA,   valueKey: 'catCode',   textKey: 'catName',
          filterKey: 'category' },
        { field: 'brand', label: '브랜드',   data: BRAND_DATA, valueKey: 'brandCode', textKey: 'brandName',
          filterKey: 'brand', dependsOn: 'cat', dependsOnKey: 'catCode' },
      ],
    }, onFilter);
    const [catSel, brandSel] = container.querySelectorAll<HTMLSelectElement>('.og-filter-select-sel');
    catSel!.value = 'ELEC';
    catSel!.dispatchEvent(new Event('change', { bubbles: true }));
    brandSel!.value = 'SAM';
    brandSel!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onFilter).toHaveBeenCalledWith('category', [{ operator: '=', value: 'ELEC' }]);
    expect(onFilter).toHaveBeenCalledWith('brand',    [{ operator: '=', value: 'SAM' }]);
  });

  it('부모 초기화 → 자식 비활성 + onReset 호출', () => {
    const container = makeContainer();
    const onReset = vi.fn();
    makePanel(container, {
      columns: [
        { field: 'cat',   label: 'C', data: CAT_DATA,   valueKey: 'catCode',   textKey: 'catName',
          filterKey: 'category' },
        { field: 'brand', label: 'B', data: BRAND_DATA, valueKey: 'brandCode', textKey: 'brandName',
          filterKey: 'brand', dependsOn: 'cat', dependsOnKey: 'catCode' },
      ],
    }, vi.fn(), onReset);
    const [catSel, brandSel] = container.querySelectorAll<HTMLSelectElement>('.og-filter-select-sel');
    catSel!.value = 'ELEC'; catSel!.dispatchEvent(new Event('change', { bubbles: true }));
    catSel!.value = '';      catSel!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(brandSel!.disabled).toBe(true);
    expect(onReset).toHaveBeenCalledWith('brand');
  });

  it('3단계 캐스케이딩 (카테고리→브랜드→모델)', () => {
    const container = makeContainer();
    makePanel(container, {
      columns: [
        { field: 'cat',   label: '카테고리', data: CAT_DATA,   valueKey: 'catCode',   textKey: 'catName' },
        { field: 'brand', label: '브랜드',   data: BRAND_DATA, valueKey: 'brandCode', textKey: 'brandName',
          dependsOn: 'cat', dependsOnKey: 'catCode' },
        { field: 'model', label: '모델',     data: MODEL_DATA, valueKey: 'modelCode', textKey: 'modelName',
          dependsOn: 'brand', dependsOnKey: 'brandCode' },
      ],
    });
    const [catSel, brandSel, modelSel] = container.querySelectorAll<HTMLSelectElement>('.og-filter-select-sel');

    catSel!.value = 'ELEC'; catSel!.dispatchEvent(new Event('change', { bubbles: true }));
    brandSel!.value = 'SAM'; brandSel!.dispatchEvent(new Event('change', { bubbles: true }));

    // Samsung 모델만 표시
    const modelVals = [...modelSel!.options].map(o => o.value).filter(v => v);
    expect(modelVals).toContain('GAL');
    expect(modelVals).toContain('NEO');
    expect(modelVals).not.toContain('OLE');  // LG 모델 제외

    // 브랜드 초기화 → 모델 비활성
    brandSel!.value = ''; brandSel!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(modelSel!.disabled).toBe(true);
  });
});

// ─── 초기화 ──────────────────────────────────────────────────
describe('FilterSelectPanel v3 — 초기화', () => {
  it('초기화 버튼 → 모든 filterKey로 onReset 호출', () => {
    const container = makeContainer();
    const onReset = vi.fn();
    makePanel(container, {
      columns: [
        { field: 'cat',   label: 'C', data: CAT_DATA,   valueKey: 'catCode',   textKey: 'catName',
          filterKey: 'category' },
        { field: 'brand', label: 'B', data: BRAND_DATA, valueKey: 'brandCode', textKey: 'brandName',
          filterKey: 'brand', dependsOn: 'cat', dependsOnKey: 'catCode' },
      ],
    }, vi.fn(), onReset);
    container.querySelector<HTMLButtonElement>('.og-filter-select-reset')!.click();
    expect(onReset).toHaveBeenCalledWith('category');
    expect(onReset).toHaveBeenCalledWith('brand');
  });

  it('reset() API 시 select 값 초기화', () => {
    const container = makeContainer();
    const panel = makePanel(container, {
      columns: [{ field: 'cat', label: 'C', data: CAT_DATA, valueKey: 'catCode', textKey: 'catName' }],
    });
    const sel = container.querySelector<HTMLSelectElement>('.og-filter-select-sel')!;
    sel.value = 'ELEC';
    panel.reset();
    expect(sel.value).toBe('');
  });
});

// ─── ARIA ────────────────────────────────────────────────────
describe('FilterSelectPanel v3 — ARIA', () => {
  it('select aria-label = 컬럼 라벨', () => {
    const container = makeContainer();
    makePanel(container, { columns: [{ field: 'cat', label: '카테고리' }] });
    expect(container.querySelector('.og-filter-select-sel')?.getAttribute('aria-label')).toBe('카테고리');
  });

  it('select aria-controls = gridId', () => {
    const container = makeContainer();
    makePanel(container, { columns: [{ field: 'f', label: 'L' }] });
    expect(container.querySelector('.og-filter-select-sel')?.getAttribute('aria-controls')).toBe('test-grid');
  });

  it('초기화 버튼 aria-label 설정', () => {
    const container = makeContainer();
    makePanel(container, { columns: [{ field: 'f', label: 'L' }] });
    expect(container.querySelector('.og-filter-select-reset')?.getAttribute('aria-label')).toBe('필터 초기화');
  });
});

// ─── destroy ─────────────────────────────────────────────────
describe('FilterSelectPanel v3 — destroy', () => {
  it('destroy() 시 DOM에서 제거됨', () => {
    const container = makeContainer();
    const panel = makePanel(container, { columns: [{ field: 'f', label: 'L' }] });
    panel.destroy();
    expect(container.querySelector('.og-filter-select')).toBeNull();
  });
});
