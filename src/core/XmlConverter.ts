/**
 * XmlConverter — XML ↔ 그리드 데이터 양방향 변환 유틸리티.
 *
 * 지원 포맷:
 *   A. Element 방식  <row><name>홍길동</name></row>
 *   B. Attribute 방식  <row name="홍길동" />
 *   C. SAP BAPI XML 응답  <RETURN><TYPE>S</TYPE><BELNR>...</BELNR></RETURN>
 *   D. SAP IDoc XML  <IDOC><E1HEADER SEGMENT="1"><BUKRS>1000</BUKRS></IDOC>
 *
 * 외부 의존성 없음 — 브라우저 내장 DOMParser 사용.
 */

// ─── 파싱 옵션 ────────────────────────────────────────────────
export interface XmlParseOptions {
  /** 루트 엘리먼트 태그명 (생략 시 문서 루트 자동 사용) */
  rootTag?: string;
  /** 행 엘리먼트 태그명 (생략 시 루트의 첫 번째 자식 자동 감지) */
  rowTag?: string;
  /** 값 추출 방식: 'element' | 'attribute' | 'auto'(기본) */
  mode?: 'element' | 'attribute' | 'auto';
  /** XML 태그명 → 그리드 field명 매핑 (생략 시 태그명 그대로 사용) */
  fieldMap?: Record<string, string>;
  /** 텍스트 값 앞뒤 공백 제거 (기본 true) */
  trim?: boolean;
}

// ─── 직렬화 옵션 ─────────────────────────────────────────────
export interface XmlStringifyOptions {
  /** 루트 태그명 (기본 'rows') */
  rootTag?: string;
  /** 행 태그명 (기본 'row') */
  rowTag?: string;
  /** 출력 방식: 'element'(기본) | 'attribute' */
  mode?: 'element' | 'attribute';
  /** 그리드 field명 → XML 태그명 매핑 */
  fieldMap?: Record<string, string>;
  /** XML 선언부 포함 여부 (기본 true) */
  declaration?: boolean;
  /** 들여쓰기 공백 수 (기본 2) */
  indent?: number;
  /** null/undefined 처리 문자열 (기본 '') */
  nullAs?: string;
  /** 출력에서 제외할 필드 목록 */
  excludeFields?: string[];
}

// ─── SAP 파싱 결과 ────────────────────────────────────────────
export interface SapParseResult {
  header: Record<string, string>;
  items: Record<string, string>[];
  returns: Record<string, string>[];
  raw?: Document;
}

// ─── 메인 클래스 ─────────────────────────────────────────────
export class XmlConverter {

  // ── 1. XML → 데이터 배열 ────────────────────────────────────
  /**
   * XML 문자열을 파싱하여 그리드 데이터 배열로 변환.
   * Element / Attribute 방식 자동 감지.
   *
   * @throws XML 파싱 오류 시 Error 발생
   */
  static parse(xml: string, options: XmlParseOptions = {}): Record<string, any>[] {
    const { fieldMap = {}, trim = true } = options;

    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml.trim(), 'text/xml');

    const errNode = doc.querySelector('parsererror');
    if (errNode) throw new Error(`XML 파싱 오류: ${errNode.textContent?.trim()}`);

    const root = doc.documentElement;

    // rowTag 자동 감지: 명시 → rootTag의 첫 자식 → 루트의 첫 자식
    let rowTag = options.rowTag;
    if (!rowTag) {
      const rootEl = options.rootTag ? doc.querySelector(options.rootTag) : root;
      rowTag = rootEl?.children[0]?.tagName ?? 'row';
    }

    const rowEls = doc.getElementsByTagName(rowTag);
    const rows: Record<string, any>[] = [];

    for (let i = 0; i < rowEls.length; i++) {
      const el  = rowEls[i]!;
      const row: Record<string, any> = {};

      // Attribute 방식
      for (const attr of Array.from(el.attributes)) {
        const field = fieldMap[attr.name] ?? attr.name;
        row[field]  = trim ? attr.value.trim() : attr.value;
      }

      // Element 방식 (자식 태그가 있으면 우선)
      for (const child of Array.from(el.children)) {
        const field  = fieldMap[child.tagName] ?? child.tagName;
        const text   = child.textContent ?? '';
        row[field]   = trim ? text.trim() : text;
      }

      rows.push(row);
    }

    return rows;
  }

  // ── 2. 데이터 배열 → XML ─────────────────────────────────────
  /**
   * 그리드 데이터 배열을 XML 문자열로 직렬화.
   */
  static stringify(data: Record<string, any>[], options: XmlStringifyOptions = {}): string {
    const {
      rootTag      = 'rows',
      rowTag       = 'row',
      mode         = 'element',
      fieldMap     = {},
      declaration  = true,
      indent       = 2,
      nullAs       = '',
      excludeFields = [],
    } = options;

    const pad   = ' '.repeat(indent);
    const lines: string[] = [];

    if (declaration) lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<${rootTag}>`);

    for (const item of data) {
      const entries = Object.entries(item).filter(([k]) => !excludeFields.includes(k));

      if (mode === 'attribute') {
        const attrs = entries
          .map(([k, v]) => {
            const tag = fieldMap[k] ?? k;
            const val = v == null ? nullAs : String(v);
            return `${tag}="${this._escAttr(val)}"`;
          })
          .join(' ');
        lines.push(`${pad}<${rowTag}${attrs ? ' ' + attrs : ''} />`);
      } else {
        lines.push(`${pad}<${rowTag}>`);
        for (const [k, v] of entries) {
          const tag = fieldMap[k] ?? k;
          const val = v == null ? nullAs : String(v);
          lines.push(`${pad}${pad}<${tag}>${this._escText(val)}</${tag}>`);
        }
        lines.push(`${pad}</${rowTag}>`);
      }
    }

    lines.push(`</${rootTag}>`);
    return lines.join('\n');
  }

  // ── 3. SAP BAPI XML 응답 파싱 ────────────────────────────────
  /**
   * SAP BAPI XML 응답을 파싱하여 { header, items, returns } 구조로 반환.
   *
   * 지원 패턴:
   *   <DOCUMENTHEADER>...</DOCUMENTHEADER>
   *   <ACCOUNTGL><ITEM>...</ITEM></ACCOUNTGL>
   *   <RETURN><TYPE>S</TYPE><MESSAGE>...</MESSAGE></RETURN>
   */
  static parseSap(xml: string): SapParseResult {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml.trim(), 'text/xml');

    const result: SapParseResult = { header: {}, items: [], returns: [], raw: doc };

    // DOCUMENTHEADER
    const headerEl = doc.getElementsByTagName('DOCUMENTHEADER')[0];
    if (headerEl) {
      for (const child of Array.from(headerEl.children)) {
        result.header[child.tagName] = child.textContent?.trim() ?? '';
      }
    }

    // RETURN (복수 지원)
    const returnEls = doc.getElementsByTagName('RETURN');
    for (const r of Array.from(returnEls)) {
      const ret: Record<string, string> = {};
      for (const child of Array.from(r.children)) {
        ret[child.tagName] = child.textContent?.trim() ?? '';
      }
      result.returns.push(ret);
    }

    // 라인 아이템 — 순서대로 시도
    const itemParentTags = ['ACCOUNTGL', 'ACCOUNTRECEIVABLE', 'ACCOUNTPAYABLE', 'ITEMS'];
    for (const parentTag of itemParentTags) {
      const parentEl = doc.getElementsByTagName(parentTag)[0];
      if (!parentEl) continue;

      // <ITEM> 자식이 있으면 ITEM 단위로, 없으면 parentEl 자체를 1개 아이템으로
      const itemEls = parentEl.getElementsByTagName('ITEM');
      const targets = itemEls.length > 0 ? Array.from(itemEls) : [parentEl];

      for (const el of targets) {
        const row: Record<string, string> = {};
        for (const child of Array.from(el.children)) {
          row[child.tagName] = child.textContent?.trim() ?? '';
        }
        result.items.push(row);
      }
      break;
    }

    // IDoc 패턴: <SEGMENT> 속성이 있는 최상위 자식들
    if (result.items.length === 0) {
      const root     = doc.documentElement;
      const segments = Array.from(root.children).filter(el => el.hasAttribute('SEGMENT'));
      for (const seg of segments) {
        if (seg.tagName === 'EDI_DC40') continue; // 제어 레코드 제외
        const row: Record<string, string> = {};
        for (const child of Array.from(seg.children)) {
          row[child.tagName] = child.textContent?.trim() ?? '';
        }
        if (Object.keys(row).length > 0) result.items.push(row);
      }
    }

    return result;
  }

  // ── 4. SAP BAPI 페이로드 → XML 직렬화 ───────────────────────
  /**
   * BAPI 페이로드 객체를 SAP XML 형식으로 직렬화.
   * sapGenPayload()의 결과 또는 단일 document 객체를 받음.
   */
  static stringifySap(payload: {
    BAPI_FUNCTION?: string;
    DOCUMENTHEADER?: Record<string, any>;
    ACCOUNTGL?: Record<string, any>[];
    [key: string]: any;
  }): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<BAPI_CALL>',
    ];

    if (payload.BAPI_FUNCTION) {
      lines.push(`  <FUNCTION>${this._escText(payload.BAPI_FUNCTION)}</FUNCTION>`);
    }

    if (payload.DOCUMENTHEADER && typeof payload.DOCUMENTHEADER === 'object') {
      lines.push('  <DOCUMENTHEADER>');
      for (const [k, v] of Object.entries(payload.DOCUMENTHEADER)) {
        if (v != null && v !== '') {
          lines.push(`    <${k}>${this._escText(String(v))}</${k}>`);
        }
      }
      lines.push('  </DOCUMENTHEADER>');
    }

    // 배열 타입 필드를 ACCOUNTGL로 처리
    const itemsKey = Object.keys(payload).find(
      k => Array.isArray(payload[k]) && !k.startsWith('_')
    );
    if (itemsKey) {
      lines.push(`  <${itemsKey}>`);
      for (const item of (payload[itemsKey] as Record<string, any>[])) {
        lines.push('    <ITEM>');
        for (const [k, v] of Object.entries(item)) {
          if (v != null && v !== '' && !k.startsWith('_')) {
            lines.push(`      <${k}>${this._escText(String(v))}</${k}>`);
          }
        }
        lines.push('    </ITEM>');
      }
      lines.push(`  </${itemsKey}>`);
    }

    lines.push('</BAPI_CALL>');
    return lines.join('\n');
  }

  // ── 5. 다건 documents 배열 → XML (sapGenPayload 결과 전체) ───
  /**
   * sapGenPayload()의 { totalDocuments, documents[] } 결과를
   * 다건 BAPI XML로 직렬화.
   */
  static stringifySapBatch(payload: { documents: any[] }): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<BAPI_BATCH total="${payload.documents.length}">`,
    ];
    payload.documents.forEach((doc, i) => {
      lines.push(`  <BAPI_CALL seq="${i + 1}">`);
      const inner = this.stringifySap(doc)
        .split('\n')
        .filter(l => !l.startsWith('<?xml'))
        .map(l => '    ' + l)
        .join('\n');
      lines.push(inner);
      lines.push('  </BAPI_CALL>');
    });
    lines.push('</BAPI_BATCH>');
    return lines.join('\n');
  }

  // ── 내부 이스케이프 헬퍼 ─────────────────────────────────────
  private static _escText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private static _escAttr(s: string): string {
    return this._escText(s).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
}
