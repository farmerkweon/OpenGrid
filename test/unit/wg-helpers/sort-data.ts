/**
 * 정렬 대조 자료 생성기 G01~G14 — 테스트 설계서 TEST_DESIGN_NEW.md §2-10 (DIFF-GEN). L19(T0) 소유.
 *
 * 씨앗 고정(8개): 20261121·1·2·3·42·7777·0xC0FFEE·99991. 같은 씨앗 → 같은 값 배열(결정적).
 * 각 생성기는 「값 배열」을 낸다. 행 객체로 감싸는 것은 부르는 쪽(rowsOf).
 */

export const SEEDS = [20261121, 1, 2, 3, 42, 7777, 0xC0FFEE, 99991] as const;

/** mulberry32 — 32비트 씨앗 난수. [0,1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rnd = () => number;
const pick = <T>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const int = (r: Rnd, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789가나다라마바사아자차카타파하';
const word = (r: Rnd, len: number) => { let s = ''; for (let i = 0; i < len; i++) s += ALNUM[Math.floor(r() * ALNUM.length)]; return s; };

/** S-01 의 12값 */
export const S01_VALUES: readonly any[] = ['나', 'b', 'A', '가', '', null, undefined, '10', '9', 10, 9, 'a'];

export interface Gen { id: string; name: string; rows: number; make: (seed: number) => any[] }

const SYM = [Symbol('a'), Symbol('b'), Symbol(''), Symbol('a')]; // 설명 같은 Symbol 둘(다른 값)
const OBJS = [
  { toString() { return 'obj-b'; } },
  { toString() { return 'obj-a'; } },
  { toString() { return ''; } },
];

export const GENS: readonly Gen[] = [
  { id: 'G01', name: '섞임', rows: 2000, make: s => { const r = mulberry32(s); return Array.from({ length: 2000 }, () => pick(r, S01_VALUES)); } },
  { id: 'G02', name: 'null 많음', rows: 2000, make: s => { const r = mulberry32(s); return Array.from({ length: 2000 }, () => { const x = r(); return x < 0.3 ? null : x < 0.6 ? undefined : int(r, -50, 50); }); } },
  { id: 'G03', name: '특수 숫자', rows: 2000, make: s => { const r = mulberry32(s); const xs = [NaN, Infinity, -Infinity, 0, -0, 1e-300, -1e-300]; return Array.from({ length: 2000 }, () => (r() < 0.5 ? pick(r, xs) : int(r, -1000, 1000))); } },
  { id: 'G04', name: '빈 글자', rows: 2000, make: s => { const r = mulberry32(s); const xs = ['', ' ', '\t', '  ', ' a', 'a ', '\n']; return Array.from({ length: 2000 }, () => (r() < 0.5 ? pick(r, xs) : word(r, int(r, 1, 3)))); } },
  { id: 'G05', name: '한글', rows: 2000, make: s => { const r = mulberry32(s); const xs = ['가', '각', '갸', '하', '힣', 'ㄱ', 'ㅏ', 'ㅎ', '가', '각', '가나', '가ᄀ']; return Array.from({ length: 2000 }, () => pick(r, xs) + (r() < 0.3 ? pick(r, xs) : '')); } },
  { id: 'G06', name: '서로게이트', rows: 2000, make: s => { const r = mulberry32(s); const xs = ['😀', '😁', '𠀀', '𠀁', '￿', '', '\uD83D', 'a😀', '😀a', '￿a', 'z']; return Array.from({ length: 2000 }, () => pick(r, xs) + (r() < 0.3 ? pick(r, xs) : '')); } },
  { id: 'G07', name: '대소문자', rows: 2000, make: s => { const r = mulberry32(s); const xs = ['A', 'a', 'ß', 'SS', 'ss', 'İ', 'i', 'ı', 'I']; return Array.from({ length: 2000 }, () => pick(r, xs) + (r() < 0.5 ? pick(r, xs) : '')); } },
  { id: 'G08', name: '숫자 글자', rows: 2000, make: s => { const r = mulberry32(s); const xs = ['10', '9', '010', '1e3', '-1', '+1', ' 1', '1', '1.0', '0x10']; return Array.from({ length: 2000 }, () => pick(r, xs)); } },
  { id: 'G09', name: '같은 값 많음', rows: 10000, make: s => { const r = mulberry32(s); const xs = ['p', 'q', 'r', 's', 't', 'u', 'v', 'w']; return Array.from({ length: 10000 }, () => pick(r, xs)); } },
  { id: 'G10', name: '긴 공통 머리말', rows: 500, make: s => { const r = mulberry32(s); const head = word(mulberry32(7), 3900); return Array.from({ length: 500 }, () => head + word(r, 100)); } },
  { id: 'G11', name: 'Date', rows: 2000, make: s => { const r = mulberry32(s); return Array.from({ length: 2000 }, () => { const x = r(); const t = Date.UTC(2020, 0, 1) + int(r, 0, 2000) * 86400000; return x < 0.4 ? new Date(t) : x < 0.6 ? null : new Date(t).toISOString().slice(0, 10); }); } },
  { id: 'G12', name: '그 밖 원시·객체', rows: 2000, make: s => { const r = mulberry32(s); return Array.from({ length: 2000 }, () => { const x = int(r, 0, 5); return x === 0 ? r() < 0.5 : x === 1 ? pick(r, SYM) : x === 2 ? pick(r, OBJS) : x === 3 ? [int(r, 0, 3), int(r, 0, 3)] : x === 4 ? 'true' : int(r, 0, 5); }); } },
  { id: 'G13', name: '이미 정렬·거꾸로', rows: 2000, make: s => { const asc = s % 2 === 0; const ints = Array.from({ length: 1000 }, (_, i) => (asc ? i : 999 - i)); const strs = Array.from({ length: 1000 }, (_, i) => `k${String(asc ? i : 999 - i).padStart(4, '0')}`); return [...ints, ...strs]; } },
  { id: 'G14', name: '머리말 묶음 여러 개', rows: 2000, make: s => { const r = mulberry32(s); const heads = Array.from({ length: 1000 }, (_, i) => word(mulberry32(1000 + i), 2000)); return Array.from({ length: 2000 }, () => pick(r, heads) + word(r, int(r, 0, 8))); } },
];

/** 값 배열을 행으로: { id: 원래 위치, f: 값, g: 둘째 키(같은 값 많음) } */
export function rowsOf(values: any[], seed: number): Array<{ id: number; f: any; g: string }> {
  const r = mulberry32(seed ^ 0x5bd1e995);
  const gs = ['x', 'y', 'z', null as any];
  return values.map((f, id) => ({ id, f, g: pick(r, gs) }));
}
