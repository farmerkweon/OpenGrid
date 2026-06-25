import { describe, it, expect } from 'vitest';
import { XmlConverter } from '../../src/core/XmlConverter';

// ── 1. XML 파싱 ────────────────────────────────────────────────
describe('XmlConverter.parse — Element 방식', () => {
  it('기본 Element XML을 파싱한다', () => {
    const xml = `<?xml version="1.0"?>
<rows>
  <row><name>홍길동</name><dept>개발팀</dept><salary>5000000</salary></row>
  <row><name>김철수</name><dept>마케팅팀</dept><salary>4200000</salary></row>
</rows>`;
    const rows = XmlConverter.parse(xml);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.name).toBe('홍길동');
    expect(rows[1]!.dept).toBe('마케팅팀');
    expect(rows[0]!.salary).toBe('5000000');
  });

  it('fieldMap으로 태그명을 필드명으로 매핑한다', () => {
    const xml = `<data><record><EMP_NAME>이영희</EMP_NAME><DEPT_CD>D001</DEPT_CD></record></data>`;
    const rows = XmlConverter.parse(xml, {
      rowTag: 'record',
      fieldMap: { EMP_NAME: 'name', DEPT_CD: 'deptCode' },
    });
    expect(rows[0]!.name).toBe('이영희');
    expect(rows[0]!.deptCode).toBe('D001');
  });

  it('trim 옵션이 공백을 제거한다', () => {
    const xml = `<rows><row><name>  홍길동  </name></row></rows>`;
    const trimmed = XmlConverter.parse(xml, { trim: true });
    const notTrimmed = XmlConverter.parse(xml, { trim: false });
    expect(trimmed[0]!.name).toBe('홍길동');
    expect(notTrimmed[0]!.name).toBe('  홍길동  ');
  });
});

describe('XmlConverter.parse — Attribute 방식', () => {
  it('Attribute XML을 파싱한다', () => {
    const xml = `<rows>
  <row name="홍길동" dept="개발팀" salary="5000000" />
  <row name="김철수" dept="인사팀" salary="3800000" />
</rows>`;
    const rows = XmlConverter.parse(xml);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.name).toBe('홍길동');
    expect(rows[1]!.salary).toBe('3800000');
  });
});

describe('XmlConverter.parse — 오류 처리', () => {
  it('잘못된 XML에서 오류를 발생시킨다', () => {
    expect(() => XmlConverter.parse('<invalid><unclosed>')).toThrow();
  });

  it('빈 XML은 빈 배열을 반환한다', () => {
    const rows = XmlConverter.parse('<rows></rows>');
    expect(rows).toHaveLength(0);
  });
});

// ── 2. XML 직렬화 ──────────────────────────────────────────────
describe('XmlConverter.stringify — Element 방식', () => {
  const data = [
    { name: '홍길동', dept: '개발팀', salary: 5000000 },
    { name: '김철수', dept: '마케팅팀', salary: 4200000 },
  ];

  it('데이터를 Element XML로 직렬화한다', () => {
    const xml = XmlConverter.stringify(data);
    expect(xml).toContain('<rows>');
    expect(xml).toContain('<row>');
    expect(xml).toContain('<name>홍길동</name>');
    expect(xml).toContain('<salary>5000000</salary>');
  });

  it('XML 선언부가 포함된다', () => {
    const xml = XmlConverter.stringify(data, { declaration: true });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('declaration:false 시 선언부가 없다', () => {
    const xml = XmlConverter.stringify(data, { declaration: false });
    expect(xml.startsWith('<rows>')).toBe(true);
  });

  it('fieldMap으로 필드명을 태그명으로 변환한다', () => {
    const xml = XmlConverter.stringify(data, { fieldMap: { name: 'EMP_NAME', salary: 'SALARY' } });
    expect(xml).toContain('<EMP_NAME>홍길동</EMP_NAME>');
    expect(xml).toContain('<SALARY>5000000</SALARY>');
  });
});

describe('XmlConverter.stringify — Attribute 방식', () => {
  it('데이터를 Attribute XML로 직렬화한다', () => {
    const xml = XmlConverter.stringify([{ name: '홍길동', dept: '개발팀' }], { mode: 'attribute' });
    expect(xml).toContain('name="홍길동"');
    expect(xml).toContain('dept="개발팀"');
  });
});

describe('XmlConverter.stringify — 특수 문자 이스케이프', () => {
  it('XML 특수문자를 이스케이프한다', () => {
    const xml = XmlConverter.stringify([{ text: '<script>&"test"</script>' }]);
    // element 내용: &, <, > 이스케이프 (따옴표는 element 내용에서 이스케이프 불필요)
    expect(xml).toContain('&lt;script&gt;&amp;');
    expect(xml).toContain('"test"');
    expect(xml).not.toContain('<script>');
  });
});

// ── 3. 왕복 변환 (Round-trip) ──────────────────────────────────
describe('XmlConverter 왕복 변환', () => {
  it('stringify → parse 후 원본 데이터와 일치한다', () => {
    const original = [
      { name: '홍길동', dept: '개발팀', active: 'true' },
      { name: '김철수', dept: '인사팀', active: 'false' },
    ];
    const xml    = XmlConverter.stringify(original, { declaration: false });
    const parsed = XmlConverter.parse(xml);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.name).toBe('홍길동');
    expect(parsed[1]!.dept).toBe('인사팀');
  });
});

// ── 4. SAP BAPI XML 파싱 ───────────────────────────────────────
describe('XmlConverter.parseSap', () => {
  it('SAP BAPI XML 응답을 파싱한다', () => {
    const xml = `<?xml version="1.0"?>
<Response>
  <DOCUMENTHEADER>
    <BUKRS>1000</BUKRS>
    <BELNR>1900001</BELNR>
    <GJAHR>2026</GJAHR>
  </DOCUMENTHEADER>
  <ACCOUNTGL>
    <ITEM><BUZEI>001</BUZEI><HKONT>110100</HKONT><WRBTR>1100000</WRBTR></ITEM>
    <ITEM><BUZEI>002</BUZEI><HKONT>400100</HKONT><WRBTR>1000000</WRBTR></ITEM>
  </ACCOUNTGL>
  <RETURN>
    <TYPE>S</TYPE>
    <MESSAGE>전표 1900001 생성 완료</MESSAGE>
  </RETURN>
</Response>`;
    const result = XmlConverter.parseSap(xml);
    expect(result.header.BUKRS).toBe('1000');
    expect(result.header.BELNR).toBe('1900001');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.HKONT).toBe('110100');
    expect(result.returns[0]!.TYPE).toBe('S');
    expect(result.returns[0]!.MESSAGE).toContain('1900001');
  });

  it('RETURN TYPE이 E(에러)인 경우도 파싱한다', () => {
    const xml = `<Response>
  <RETURN><TYPE>E</TYPE><MESSAGE>필수 필드 누락</MESSAGE><ID>F5</ID><NUMBER>001</NUMBER></RETURN>
</Response>`;
    const result = XmlConverter.parseSap(xml);
    expect(result.returns[0]!.TYPE).toBe('E');
    expect(result.returns[0]!.ID).toBe('F5');
  });
});

// ── 5. SAP XML 직렬화 ─────────────────────────────────────────
describe('XmlConverter.stringifySap', () => {
  it('BAPI 페이로드를 SAP XML로 직렬화한다', () => {
    const payload = {
      BAPI_FUNCTION: 'BAPI_ACC_DOCUMENT_POST',
      DOCUMENTHEADER: { BUKRS: '1000', BLDAT: '2026-05-30', WAERS: 'KRW' },
      ACCOUNTGL: [
        { BUZEI: '001', HKONT: '110100', WRBTR: 1100000 },
        { BUZEI: '002', HKONT: '400100', WRBTR: 1000000 },
      ],
    };
    const xml = XmlConverter.stringifySap(payload);
    expect(xml).toContain('<FUNCTION>BAPI_ACC_DOCUMENT_POST</FUNCTION>');
    expect(xml).toContain('<BUKRS>1000</BUKRS>');
    expect(xml).toContain('<ACCOUNTGL>');
    expect(xml).toContain('<HKONT>110100</HKONT>');
  });

  it('null/빈 값 필드는 XML에서 제외된다', () => {
    const payload = {
      BAPI_FUNCTION: 'BAPI_TEST',
      DOCUMENTHEADER: { BUKRS: '1000', XBLNR: '', BKTXT: null },
      ACCOUNTGL: [],
    };
    const xml = XmlConverter.stringifySap(payload);
    expect(xml).not.toContain('<XBLNR>');
    expect(xml).not.toContain('<BKTXT>');
    expect(xml).toContain('<BUKRS>1000</BUKRS>');
  });
});
