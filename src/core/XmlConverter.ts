/**
 * XmlConverter — XML ↔ 그리드 데이터 양방향 변환 유틸리티.
 * / XmlConverter — bidirectional XML ↔ grid-data conversion utility.
 *
 * SAP·레거시 백엔드처럼 JSON이 아니라 XML로 응답을 주는 시스템과 그리드를 연결할 때 쓴다.
 * 데이터가 흐르는 방향은 두 가지다: **입력**(서버가 준 XML 문자열) → **변환**(태그/속성을
 * 파싱해 행 객체 배열로 정규화) → **출력**(그리드가 바로 `setData()`에 넣을 수 있는
 * `Record<string, any>[]`). 반대 방향(그리드에서 편집한 데이터 → XML)도 동일한 변환기로 처리한다.
 * / Use this to bridge the grid with systems that answer in XML instead of JSON — SAP and other
 * legacy backends being the common case. Data flows in two directions: **input** (the XML string
 * a server returned) → **transform** (tags/attributes parsed and normalized into row objects) →
 * **output** (a `Record<string, any>[]` the grid can pass straight to `setData()`). The reverse
 * direction (grid-edited data → XML) goes through the same converter.
 *
 * 지원 포맷 / Supported formats:
 *   A. Element 방식  <row><name>홍길동</name></row>
 *   B. Attribute 방식  <row name="홍길동" />
 *   C. SAP BAPI XML 응답  <RETURN><TYPE>S</TYPE><BELNR>...</BELNR></RETURN>
 *   D. SAP IDoc XML  <IDOC><E1HEADER SEGMENT="1"><BUKRS>1000</BUKRS></IDOC>
 *
 * 외부 의존성 없음 — 브라우저 내장 DOMParser 사용.
 * / No external dependency — uses the browser's built-in DOMParser.
 */

// ─── 파싱 옵션 ────────────────────────────────────────────────
/** XML → 데이터 파싱 옵션. / Options for parsing XML into data. */
export interface XmlParseOptions {
  /** 루트 엘리먼트 태그명. 생략 시 문서 루트 자동 사용. / Root element tag name; falls back to the document root when omitted. */
  rootTag?: string;
  /** 행 엘리먼트 태그명. 생략 시 루트의 첫 번째 자식 자동 감지. / Row element tag name; auto-detected from the root's first child when omitted. */
  rowTag?: string;
  /** 값 추출 방식: 'element' | 'attribute' | 'auto'(기본). / Value extraction mode: 'element' | 'attribute' | 'auto' (default). @defaultValue 'auto' */
  mode?: 'element' | 'attribute' | 'auto';
  /** XML 태그명 → 그리드 field명 매핑. 생략 시 태그명 그대로 사용. / XML tag name → grid field name map; tag names are used as-is when omitted. */
  fieldMap?: Record<string, string>;
  /** 텍스트 값 앞뒤 공백 제거. 기본 true. / Trim whitespace around text values. Default true. @defaultValue true */
  trim?: boolean;
}

// ─── 직렬화 옵션 ─────────────────────────────────────────────
/** 데이터 → XML 직렬화 옵션. / Options for serializing data into XML. */
export interface XmlStringifyOptions {
  /** 루트 태그명. 기본 'rows'. / Root tag name. Default 'rows'. @defaultValue 'rows' */
  rootTag?: string;
  /** 행 태그명. 기본 'row'. / Row tag name. Default 'row'. @defaultValue 'row' */
  rowTag?: string;
  /** 출력 방식: 'element'(기본) | 'attribute'. / Output mode: 'element' (default) | 'attribute'. @defaultValue 'element' */
  mode?: 'element' | 'attribute';
  /** 그리드 field명 → XML 태그명 매핑. / Grid field name → XML tag name map. */
  fieldMap?: Record<string, string>;
  /** XML 선언부 포함 여부. 기본 true. / Whether to include the XML declaration. Default true. @defaultValue true */
  declaration?: boolean;
  /** 들여쓰기 공백 수. 기본 2. / Indentation space count. Default 2. @defaultValue 2 */
  indent?: number;
  /** null/undefined 처리 문자열. 기본 ''. / String used for null/undefined values. Default ''. @defaultValue '' */
  nullAs?: string;
  /** 출력에서 제외할 필드 목록. / Field names to exclude from the output. */
  excludeFields?: string[];
}

// ─── SAP 파싱 결과 ────────────────────────────────────────────
/** SAP XML 파싱 결과 구조. / Result structure of SAP XML parsing. */
export interface SapParseResult {
  /** 문서 헤더(DOCUMENTHEADER) 필드 맵. / Document header (DOCUMENTHEADER) field map. */
  header: Record<string, string>;
  /** 라인 아이템 행 배열. / Line-item row array. */
  items: Record<string, string>[];
  /** RETURN 메시지 행 배열(복수). / RETURN message rows (may be multiple). */
  returns: Record<string, string>[];
  /** 파싱에 사용한 원본 Document(선택). / The source Document used for parsing (optional). */
  raw?: Document;
}

// ─── 메인 클래스 ─────────────────────────────────────────────
/**
 * XML ↔ 그리드 데이터 변환기(정적 메서드 모음). / XML ↔ grid-data converter (static methods).
 *
 * @example
 * const rows = XmlConverter.parse('<rows><row><name>Kim</name></row></rows>');
 * const xml  = XmlConverter.stringify(rows);
 */
export class XmlConverter {

  // ── 1. XML → 데이터 배열 ────────────────────────────────────
  /**
   * XML 문자열을 파싱하여 그리드 데이터 배열로 변환. Element / Attribute 방식 자동 감지.
   * / Parse an XML string into a grid-data array. Auto-detects element vs. attribute style.
   *
   * @param xml - 파싱할 XML 문자열 / XML string to parse
   * @param options - 파싱 옵션 / Parse options
   * @returns 행 객체 배열 / Array of row objects
   * @throws XML 파싱 오류 시 Error 발생 / Throws an Error on XML parse failure
   * @example
   * // <rows><row><name>Kim</name><dept>Sales</dept></row></rows>
   * const rows = XmlConverter.parse(xmlText);
   * grid.setData(rows); // → [{ name: 'Kim', dept: 'Sales' }]
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
   * 그리드 데이터 배열을 XML 문자열로 직렬화. / Serialize a grid-data array into an XML string.
   *
   * @param data - 직렬화할 행 배열 / Row array to serialize
   * @param options - 직렬화 옵션 / Serialize options
   * @returns XML 문자열 / XML string
   * @example
   * // 그리드에서 수정된 행을 서버로 보낼 때 / Sending grid-edited rows back to a server
   * const xml = XmlConverter.stringify(grid.getEditedRows(), { mode: 'attribute' });
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
   * / Parse a SAP BAPI XML response into a { header, items, returns } structure.
   *
   * SAP BAPI 응답은 "행이 죽 나열된" 단순 목록이 아니라 문서 헤더(DOCUMENTHEADER)·라인
   * 아이템(ACCOUNTGL 등)·처리 결과 메시지(RETURN)가 뒤섞여 한 응답 안에 들어온다. 그래서 범용
   * `parse()`(단일 rowTag 기준)로는 못 풀고, 이 메서드가 세 부분을 각각 알아서 찾아 분리해 준다.
   * 라인 아이템은 그리드에 그대로 `setData()`할 수 있는 배열로 나온다.
   * / A SAP BAPI response isn't a flat list of rows — a document header (DOCUMENTHEADER), line
   * items (e.g. ACCOUNTGL), and result messages (RETURN) are all mixed into one response. The
   * generic `parse()` (which assumes a single rowTag) can't untangle that, so this method locates
   * and splits all three parts for you. `items` comes out ready to hand to the grid's `setData()`.
   *
   * 지원 패턴 / Supported patterns:
   *   <DOCUMENTHEADER>...</DOCUMENTHEADER>
   *   <ACCOUNTGL><ITEM>...</ITEM></ACCOUNTGL>
   *   <RETURN><TYPE>S</TYPE><MESSAGE>...</MESSAGE></RETURN>
   *
   * @param xml - SAP BAPI XML 응답 문자열 / SAP BAPI XML response string
   * @returns 파싱 결과 구조 / Parsed result structure
   * @example
   * const { header, items, returns } = XmlConverter.parseSap(sapResponseXml);
   * grid.setData(items);
   * if (returns.some(r => r.TYPE === 'E')) console.error('SAP 오류 응답', returns);
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
   * BAPI 페이로드 객체를 SAP XML 형식으로 직렬화. sapGenPayload() 결과 또는 단일 document 객체를 받음.
   * / Serialize a BAPI payload object into SAP XML. Accepts a sapGenPayload() result or a single document object.
   *
   * `parseSap()`의 반대 방향 — 그리드에서 만든/편집한 전표 데이터를 SAP가 받을 수 있는
   * BAPI 호출용 XML로 만들 때 쓴다. / The reverse of `parseSap()` — use this to turn
   * grid-built/edited document data into the BAPI-call XML that SAP expects.
   *
   * @param payload - BAPI 페이로드 객체 / BAPI payload object
   * @returns SAP XML 문자열 / SAP XML string
   * @example
   * const xml = XmlConverter.stringifySap({
   *   BAPI_FUNCTION: 'BAPI_ACC_DOCUMENT_POST',
   *   DOCUMENTHEADER: { COMP_CODE: '1000', DOC_DATE: '20260101' },
   *   ACCOUNTGL: grid.getData(),
   * });
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
   * sapGenPayload() 의 { totalDocuments, documents[] } 결과를 다건 BAPI XML 로 직렬화.
   * / Serialize a sapGenPayload() { totalDocuments, documents[] } result into a multi-document BAPI XML.
   *
   * @param payload - documents 배열을 담은 페이로드 / Payload holding the documents array
   * @returns 다건 BAPI XML 문자열 / Multi-document BAPI XML string
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
