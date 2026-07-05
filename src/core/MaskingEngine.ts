// ============================================================
// F5: MaskingEngine — 컬럼 데이터 마스킹 처리
// ============================================================
//
// 지원 타입 (MaskType):
//   ssn      — 주민등록번호   930101-1******
//   phone    — 전화번호       010-****-5678 / 02-****-5678
//   mobile   — 휴대폰 (phone과 동일)
//   email    — 이메일         ho***@example.com
//   credit   — 신용카드       1234-****-****-5678
//   account  — 계좌번호       123-*****-1234 (앞3 뒤4 노출)
//   password — 비밀번호       ******* (전체 마스킹)
//   name     — 이름           홍*동 / 홍**
//   ip       — IP 주소        192.168.***.***
//   partial  — 부분 마스킹    visiblePrefix/visibleSuffix 자유 지정
//
// 사용법:
//   applyMask('01012345678', 'phone')
//   → '010-****-5678'
//
//   applyMask('hong@example.com', { type: 'email', char: '#' })
//   → 'ho###@example.com'
//
//   applyMask('1234567890', { type: 'partial', visiblePrefix: 2, visibleSuffix: 2 })
//   → '12******90'
// ============================================================

/** 지원 마스킹 타입. / Supported masking types. */
export type MaskType =
  | 'ssn'       // 주민등록번호: 930101-1******
  | 'phone'     // 전화번호: 010-****-5678
  | 'mobile'    // 휴대폰 (phone과 동일)
  | 'email'     // 이메일: ho***@example.com
  | 'credit'    // 신용카드: 1234-****-****-5678
  | 'account'   // 계좌번호: 123-*****-1234
  | 'password'  // 비밀번호: ******* (전체)
  | 'name'      // 이름: 홍*동
  | 'ip'        // IP 주소: 192.168.***.***
  | 'partial';  // 부분 마스킹 (visiblePrefix/visibleSuffix 지정)

/** 마스킹 상세 옵션. / Detailed masking options. */
export interface MaskDef {
  /** 마스킹 타입. / Masking type. */
  type: MaskType;
  /** 마스킹 치환 문자. 기본 '*'. / Masking replacement character. Default '*'. @defaultValue '*' */
  char?: string;
  /** partial/account: 앞 N자리 표시. / partial/account: reveal the first N characters. */
  visiblePrefix?: number;
  /** partial/account: 뒤 N자리 표시. / partial/account: reveal the last N characters. */
  visibleSuffix?: number;
}

/**
 * 원본 값에 마스킹을 적용해 표시용 문자열을 반환. / Apply masking to a raw value and return a display string.
 *
 * @param value - 원본 값 (null/undefined → 빈 문자열 그대로 반환) / Raw value (null/undefined → empty string)
 * @param maskDef - 마스킹 타입 또는 상세 옵션 / Masking type or detailed options
 * @returns 마스킹된 문자열 / The masked string
 *
 * @example
 * applyMask('930101-1234567', 'ssn')   // '930101-1******'
 * applyMask('01012345678',    'phone') // '010-****-5678'
 * applyMask('hong@test.com',  'email') // 'ho***@test.com'
 */
export function applyMask(value: string, maskDef: MaskType | MaskDef): string {
  if (value == null || value === '') return value ?? '';
  const def: MaskDef = typeof maskDef === 'string' ? { type: maskDef } : maskDef;
  const char = def.char ?? '*';

  switch (def.type) {
    case 'ssn':     return _maskSSN(value, char);
    case 'phone':
    case 'mobile':  return _maskPhone(value, char);
    case 'email':   return _maskEmail(value, char);
    case 'credit':  return _maskCredit(value, char);
    case 'account': return _maskAccount(value, char, def.visiblePrefix ?? 3, def.visibleSuffix ?? 4);
    case 'password': return char.repeat(Math.max(value.length, 6));
    case 'name':    return _maskName(value, char);
    case 'ip':      return _maskIP(value, char);
    case 'partial': return _maskPartial(value, char, def.visiblePrefix ?? 0, def.visibleSuffix ?? 4);
    default:        return value;
  }
}

// ─────────────────────────────────────────────────────────────
// 개별 마스킹 함수
// ─────────────────────────────────────────────────────────────

/**
 * 주민등록번호 마스킹
 * 입력: '9301011234567' 또는 '930101-1234567'
 * 출력: '930101-1******'  (앞 6자리 + 뒷 1자리 노출, 나머지 마스킹)
 */
function _maskSSN(v: string, c: string): string {
  const clean = v.replace(/[^0-9]/g, '');
  if (clean.length < 7) {
    // 7자리 미만이면 구분자 유지하며 뒷자리 마스킹
    const sep = v.includes('-') ? '-' : '';
    const frontEnd = v.indexOf('-') >= 0 ? v.indexOf('-') : 6;
    return v.slice(0, frontEnd) + sep + c.repeat(Math.max(1, v.length - frontEnd - sep.length));
  }
  const front = clean.slice(0, 6);
  const backFirst = clean[6]!;
  const maskLen = clean.length - 7;
  return `${front}-${backFirst}${c.repeat(maskLen)}`;
}

/**
 * 전화번호/휴대폰 마스킹
 * 입력: '01012345678' → '010-****-5678'
 * 입력: '0215551234'  → '02-****-1234'
 * 입력: '0319991234'  → '031-***-1234'
 */
function _maskPhone(v: string, c: string): string {
  const clean = v.replace(/[^0-9]/g, '');
  if (clean.length === 11) {
    // 010-xxxx-xxxx (11자리 휴대폰)
    return `${clean.slice(0, 3)}-${c.repeat(4)}-${clean.slice(7)}`;
  } else if (clean.length === 10) {
    if (clean.startsWith('02')) {
      // 서울 02-xxxx-xxxx
      return `${clean.slice(0, 2)}-${c.repeat(4)}-${clean.slice(6)}`;
    }
    // 지역번호 3자리 031-xxx-xxxx
    return `${clean.slice(0, 3)}-${c.repeat(3)}-${clean.slice(6)}`;
  } else if (clean.length === 9) {
    // 02-xxx-xxxx (구형 서울)
    return `${clean.slice(0, 2)}-${c.repeat(3)}-${clean.slice(5)}`;
  }
  // fallback: 앞 3자리 + 뒤 4자리 노출
  return _maskPartial(v, c, 3, 4);
}

/**
 * 이메일 마스킹
 * 입력: 'hong@example.com' → 'ho***@example.com'
 * 입력: 'a@b.com'          → 'a***@b.com'   (1자리도 앞 1자리 노출)
 */
function _maskEmail(v: string, c: string): string {
  const atIdx = v.indexOf('@');
  if (atIdx < 0) return _maskPartial(v, c, 2, 0);
  const local = v.slice(0, atIdx);
  const domain = v.slice(atIdx); // '@' 포함
  const visLen = Math.min(2, local.length);
  const visible = local.slice(0, visLen);
  // 마스킹 최소 3자리 이상으로 표시 (원본 길이 무관)
  const maskLen = Math.max(local.length - visLen, 3);
  return `${visible}${c.repeat(maskLen)}${domain}`;
}

/**
 * 신용카드 마스킹
 * 입력: '4123456789012345' → '4123-****-****-2345'
 * 앞 4자리 + 뒤 4자리 노출, 중간 마스킹 (4자리씩 구분)
 */
function _maskCredit(v: string, c: string): string {
  const clean = v.replace(/[^0-9]/g, '');
  if (clean.length < 8) return v;
  const first4 = clean.slice(0, 4);
  const last4  = clean.slice(-4);
  const midLen = clean.length - 8;
  // 중간부가 없으면 8자리(****-****)로 패딩
  const mid = c.repeat(Math.max(midLen, 8));
  const parts: string[] = [first4];
  for (let i = 0; i < mid.length; i += 4) {
    const chunk = mid.slice(i, i + 4);
    if (chunk) parts.push(chunk);
  }
  parts.push(last4);
  return parts.join('-');
}

/**
 * 계좌번호 마스킹
 * 입력: '1234567890123' → '123-*******-0123' (기본 앞3 뒤4)
 * visiblePrefix/visibleSuffix로 조절 가능
 */
function _maskAccount(v: string, c: string, prefixLen: number, suffixLen: number): string {
  const clean = v.replace(/[^0-9]/g, '');
  if (clean.length <= prefixLen + suffixLen) {
    return _maskPartial(clean, c, prefixLen, suffixLen);
  }
  const prefix = clean.slice(0, prefixLen);
  const suffix = clean.slice(-suffixLen);
  const midLen = clean.length - prefixLen - suffixLen;
  return `${prefix}-${c.repeat(midLen)}-${suffix}`;
}

/**
 * 이름 마스킹
 * 2자: 홍* (첫 글자만 노출)
 * 3자: 홍*동 (첫글자+끝글자, 중간 마스킹)
 * 4자+: 홍**동
 */
function _maskName(v: string, c: string): string {
  const t = v.trim();
  if (t.length === 0) return v;
  if (t.length === 1) return c;
  if (t.length === 2) return `${t[0]}${c}`;
  // 3자 이상: 첫글자 + 중간 마스킹 + 끝글자
  return `${t[0]}${c.repeat(t.length - 2)}${t[t.length - 1]}`;
}

/**
 * IP 주소 마스킹
 * 입력: '192.168.1.100' → '192.168.***.***'
 * 앞 2옥텟 노출, 3·4 옥텟 마스킹
 */
function _maskIP(v: string, c: string): string {
  const parts = v.split('.');
  if (parts.length !== 4) return _maskPartial(v, c, 3, 0);
  const maskOctet = (octet: string) => c.repeat(Math.max(octet.length, 3));
  return `${parts[0]}.${parts[1]}.${maskOctet(parts[2]!)}.${maskOctet(parts[3]!)}`;
}

/**
 * 부분 마스킹
 * 앞 visiblePrefix자리 + 중간 마스킹 + 뒤 visibleSuffix자리 노출
 * 예) applyMask('1234567890', { type:'partial', visiblePrefix:2, visibleSuffix:2 })
 *     → '12******90'
 */
function _maskPartial(v: string, c: string, prefixLen: number, suffixLen: number): string {
  if (v.length <= prefixLen + suffixLen) return v;
  const prefix = v.slice(0, prefixLen);
  const suffix = suffixLen > 0 ? v.slice(-suffixLen) : '';
  const midLen = v.length - prefixLen - suffixLen;
  return `${prefix}${c.repeat(midLen)}${suffix}`;
}
