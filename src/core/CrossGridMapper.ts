// ============================================================
// 그리드↔그리드 필드 매핑 UI + 스크립트 생성기
// ------------------------------------------------------------
// crossGrid 드롭 시 소스/타깃 스키마(필드)가 다를 때, 개발자가
// "타깃 필드 ← 소스 필드"를 매칭하는 모달을 띄운다. 확인하면
//  ① 매핑(Record<타깃, 소스>)을 반환하고
//  ② 그대로 crossGridMapping 에 baking 할 수 있는 변환 스크립트를 출력한다.
// 디자인타임 헬퍼 — 한 번 매핑을 확정하면 스크립트를 코드에 박아 모달 없이 운영한다.
// / Grid-to-grid field mapping UI + script generator.
//   When a crossGrid drop finds mismatched source/target schemas (fields), it opens a modal for
//   the developer to match "target field ← source field". On confirm it
//    ① returns the mapping (Record<target, source>), and
//    ② emits a transform script that can be baked directly into crossGridMapping.
//   Design-time helper — once the mapping is fixed, bake the script into code and run without the modal.
// ============================================================

// i18n: 크로스그리드 매핑 모달은 디자인타임 헬퍼(standalone 함수, 인스턴스 컨텍스트 없음) →
//   전역 t 로 라벨/설명/버튼을 해석(설계 §3 헬퍼 예외).
// / The cross-grid mapping modal is a design-time helper (standalone function, no instance context),
//   so labels/descriptions/buttons resolve via the global t (design §3 helper exception).
import { t } from './i18n/LocaleRegistry.js';

/** 한 컬럼의 매핑용 최소 필드 정보. / Minimal field info of a single column, used for mapping. */
export interface FieldInfo {
  /** 컬럼 field 키. / Column field key. */
  field: string;
  /** 컬럼 헤더 라벨(표시용). / Column header label (for display). */
  header: string;
}

/** 매핑 모달 확정 결과. / Result of confirming the mapping modal. */
export interface MappingResult {
  /** 타깃필드 → 소스필드 (빈 문자열이면 미매핑). / Target field → source field (empty string = unmapped). */
  mapping: Record<string, string>;
  /** crossGridMapping 에 그대로 쓸 수 있는 변환 함수 소스. / Transform-function source usable as-is in crossGridMapping. */
  script: string;
}

/** 미매핑을 나타내는 센티널(빈 문자열). / Sentinel for "unmapped" (empty string). */
const NONE = '';

/**
 * mapping → 변환 함수 스크립트 문자열 생성.
 * / Build a transform-function script string from a mapping.
 *
 * @param mapping - 타깃필드 → 소스필드 매핑(빈 값은 제외) / Target-to-source field mapping (empty entries skipped)
 * @returns 코드에 붙여넣을 수 있는 `mapRow(src)` 함수 소스 / `mapRow(src)` function source ready to paste into code
 * @example
 * const script = buildMappingScript({ name: 'userName', age: '' });
 * // → "function mapRow(src) { return { \"name\": src[\"userName\"], }; }"
 */
export function buildMappingScript(mapping: Record<string, string>): string {
  const lines = Object.entries(mapping)
    .filter(([, src]) => src !== NONE)
    .map(([tgt, src]) => `    ${JSON.stringify(tgt)}: src[${JSON.stringify(src)}],`);
  return (
    t('crossGrid.scriptComment') + '\n' +
    'function mapRow(src) {\n' +
    '  return {\n' +
    lines.join('\n') + (lines.length ? '\n' : '') +
    '  };\n' +
    '}'
  );
}

/**
 * mapping → 실제 행 변환 함수.
 * / Build the actual row transform function from a mapping.
 *
 * @param mapping - 타깃필드 → 소스필드 매핑 / Target-to-source field mapping
 * @returns 소스 행을 타깃 스키마로 변환하는 함수 / A function converting a source row into the target schema
 * @example
 * const toTarget = buildTransform({ name: 'userName' });
 * toTarget({ userName: 'Kim' }); // → { name: 'Kim' }
 */
export function buildTransform(mapping: Record<string, string>): (src: any) => any {
  return (src: any) => {
    const out: Record<string, any> = {};
    for (const [tgt, sf] of Object.entries(mapping)) {
      if (sf !== NONE) out[tgt] = src[sf];
    }
    return out;
  };
}

/**
 * 같은 필드 집합인지 (순서 무관).
 * / Whether two field sets are equal (order-independent).
 *
 * @param a - 필드명 배열 A / Field-name array A
 * @param b - 필드명 배열 B / Field-name array B
 * @returns 두 집합이 동일하면 true / true when the two sets are identical
 */
export function sameSchema(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every(f => sb.has(f));
}

/**
 * 매핑 모달을 띄우고 사용자가 확정한 매핑을 Promise 로 반환한다. (취소 시 null)
 * 모달은 document.body 에 오버레이로 붙는다(디자인타임 헬퍼).
 * / Open the mapping modal and return the user-confirmed mapping as a Promise (null on cancel).
 *   The modal attaches to document.body as an overlay (design-time helper).
 *
 * @param sourceFields - 소스 그리드의 필드 목록 / Field list of the source grid
 * @param targetFields - 타깃 그리드의 필드 목록 / Field list of the target grid
 * @returns 확정된 매핑 결과, 취소 시 null / The confirmed mapping result, or null on cancel
 * @example
 * const result = await openCrossGridMapper(srcCols, tgtCols);
 * if (result) console.log(result.script); // 변환 스크립트 / transform script
 */
export function openCrossGridMapper(
  sourceFields: FieldInfo[],
  targetFields: FieldInfo[],
): Promise<MappingResult | null> {
  return new Promise((resolve) => {
    // ── 기본 매핑: 같은 필드명 자동 매칭 ── / default mapping: auto-match identical field names
    const srcSet = new Set(sourceFields.map(f => f.field));
    const mapping: Record<string, string> = {};
    for (const tf of targetFields) mapping[tf.field] = srcSet.has(tf.field) ? tf.field : NONE;

    // ── 오버레이 ── / overlay
    const overlay = document.createElement('div');
    overlay.className = 'og-mapper-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t('crossGrid.overlayAria'));
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.45);' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:var(--og-font-family,-apple-system,sans-serif);';

    const box = document.createElement('div');
    box.style.cssText =
      'background:#fff;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.3);' +
      'width:min(620px,92vw);max-height:88vh;overflow:auto;color:#222;';
    overlay.appendChild(box);

    // ── 헤더 ── / header
    const head = document.createElement('div');
    head.style.cssText = 'padding:18px 20px 8px;';
    head.innerHTML =
      '<div style="font-size:16px;font-weight:700;">' + t('crossGrid.title') + '</div>' +
      '<div style="font-size:12.5px;color:#666;margin-top:4px;line-height:1.5;">' +
      t('crossGrid.desc1') +
      t('crossGrid.desc2') + '</div>';
    box.appendChild(head);

    // ── 매핑 테이블 ── / mapping table
    const table = document.createElement('div');
    table.style.cssText = 'padding:6px 20px;';
    const optionHtml =
      `<option value="">${t('crossGrid.emptyOption')}</option>` +
      sourceFields.map(f =>
        `<option value="${esc(f.field)}">${esc(f.header)} &lt;${esc(f.field)}&gt;</option>`
      ).join('');

    for (const tf of targetFields) {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f0f0f0;';
      const label = document.createElement('div');
      label.style.cssText = 'flex:1;font-size:13px;min-width:0;';
      label.innerHTML =
        `<span style="font-weight:600;">${esc(tf.header)}</span>` +
        `<span style="color:#999;font-size:11.5px;"> &lt;${esc(tf.field)}&gt;</span>`;
      const arrow = document.createElement('span');
      arrow.textContent = '←';
      arrow.style.cssText = 'color:#888;flex-shrink:0;';
      const sel = document.createElement('select');
      sel.style.cssText =
        'flex:1;min-width:0;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;background:#fff;';
      sel.innerHTML = optionHtml;
      sel.value = mapping[tf.field] ?? NONE;
      sel.addEventListener('change', () => { mapping[tf.field] = sel.value; refreshScript(); });
      row.append(label, arrow, sel);
      table.appendChild(row);
    }
    box.appendChild(table);

    // ── 스크립트 미리보기 + 복사 ── / script preview + copy
    const scriptWrap = document.createElement('div');
    scriptWrap.style.cssText = 'padding:10px 20px 4px;';
    const scriptHead = document.createElement('div');
    scriptHead.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
    scriptHead.innerHTML = '<span style="font-size:12.5px;font-weight:600;color:#444;">' + t('crossGrid.scriptTitle') + '</span>';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = t('crossGrid.copy');
    copyBtn.style.cssText =
      'font-size:12px;padding:4px 10px;border:1px solid #ccc;border-radius:6px;background:#f7f7f7;cursor:pointer;';
    scriptHead.appendChild(copyBtn);
    const pre = document.createElement('pre');
    pre.style.cssText =
      'margin:0;background:#0d1117;color:#c9d1d9;padding:12px;border-radius:8px;' +
      'font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.5;overflow:auto;max-height:180px;';
    scriptWrap.append(scriptHead, pre);
    box.appendChild(scriptWrap);

    function currentScript(): string { return buildMappingScript(mapping); }
    function refreshScript(): void { pre.textContent = currentScript(); }
    refreshScript();

    copyBtn.addEventListener('click', () => {
      const txt = currentScript();
      navigator.clipboard?.writeText(txt).then(
        () => { copyBtn.textContent = t('crossGrid.copied'); setTimeout(() => (copyBtn.textContent = t('crossGrid.copy')), 1200); },
        () => { copyBtn.textContent = t('crossGrid.copyFailed'); setTimeout(() => (copyBtn.textContent = t('crossGrid.copy')), 1200); },
      );
    });

    // ── 푸터 ── / footer
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:14px 20px 18px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = t('crossGrid.cancel');
    cancelBtn.style.cssText =
      'font-size:13px;padding:8px 16px;border:1px solid #ccc;border-radius:7px;background:#fff;cursor:pointer;';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = t('crossGrid.applyMove');
    okBtn.style.cssText =
      'font-size:13px;padding:8px 16px;border:0;border-radius:7px;background:#1976d2;color:#fff;cursor:pointer;font-weight:600;';
    foot.append(cancelBtn, okBtn);
    box.appendChild(foot);

    // ── 닫기 처리 ── / close handling
    let done = false;
    function close(result: MappingResult | null): void {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close(null);
    }
    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    okBtn.addEventListener('click', () => close({ mapping: { ...mapping }, script: currentScript() }));
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

/**
 * HTML 특수문자 이스케이프(모달 innerHTML 주입 안전용). / Escape HTML special chars (safe for modal innerHTML injection).
 *
 * @param s - 원본 문자열 / Source string
 * @returns 이스케이프된 문자열 / The escaped string
 */
function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
