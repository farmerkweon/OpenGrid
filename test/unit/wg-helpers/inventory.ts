/**
 * 넓은 그리드 T0 목록 도우미 — 지문(EX)·이음새(AR-12)·파일 주인(AR-13)·공개 API 목록(AR-20).
 *
 * 모든 함수는 DOM 을 쓰지 않는다(node 환경에서 돈다). 저장소 루트 = process.cwd()(vitest 기본).
 * 「손으로 적은 목록」 대신 문서·소스에서 뽑아 내는 것이 목적이다: 설계서 표가 바뀌면 목록도 따라 바뀌고,
 * 소스에서 이름이 사라지면 여기서 바로 드러난다.
 *
 * Wide-grid T0 inventory helpers — fingerprints (EX), seams (AR-12), file owners (AR-13) and the
 * public-API inventory (AR-20). No DOM; repo root = process.cwd(). Lists are extracted from the
 * design documents and sources rather than typed by hand.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

export const REPO = process.cwd();
export const SESSION = join(REPO, 'sessions/widegrid-perf-2026-11');
export const DESIGN_MD = join(SESSION, 'design/DESIGN.md');
export const TEST_DESIGN_MD = join(SESSION, 'design/TEST_DESIGN_NEW.md');
export const GOLDEN_DIR = join(REPO, 'test/unit/__golden__/wg');

export function readRepo(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

export function sha256OfFile(rel: string): string {
  return createHash('sha256').update(readFileSync(join(REPO, rel))).digest('hex');
}

export function git(args: string): string {
  return execSync(`git ${args}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// ── EX-00: 테스트 설계서 §8-3 표에서 (파일, sha256) 짝을 읽는다 ─────────────────────────────
export interface FingerprintRow { file: string; sha256: string }

export function parseEx00Table(md: string = readFileSync(TEST_DESIGN_MD, 'utf8')): FingerprintRow[] {
  const start = md.indexOf('**EX-00 기준 지문 표**');
  if (start < 0) throw new Error('EX-00 표 머리를 찾지 못함');
  const rows: FingerprintRow[] = [];
  for (const line of md.slice(start).split('\n').slice(1)) {
    if (rows.length && !line.startsWith('|')) break;
    const m = /^\|\s*(test\/[^\s|]+)[^|]*\|\s*([0-9a-f]{64})\s*\|/.exec(line);
    if (m) rows.push({ file: m[1]!, sha256: m[2]! });
  }
  return rows;
}

// ── AR-13: 설계서 §5-가 레인 표 · §5-나 걸음 표에서 경로를 뽑는다 ───────────────────────────
export const LANES = ['STR', 'GEO', 'WIN', 'BODY', 'SORT', 'EDGE', 'VP', 'TEST', 'MEAS'] as const;
export type Lane = (typeof LANES)[number];

/** 백틱 안 낱말 가운데 「경로처럼 생긴 것」만 고른다(파일 확장자 또는 `*` 로 끝남, 빈칸·괄호 없음). */
export function pathTokens(cell: string): string[] {
  const out: string[] = [];
  for (const m of cell.matchAll(/`([^`]+)`/g)) {
    let t = m[1]!.trim();
    if (/[ ()]/.test(t)) continue;
    if (!/[/.]/.test(t)) continue;
    if (!/(\.(ts|tsx|mjs|css)|\*)$/.test(t)) continue;
    t = t.replace(/^`|`$/g, '');
    out.push(t);
  }
  return out;
}

/** 설계서 표 낱말을 저장소 경로로. 설계서는 `src/core/` 를 줄여 쓴다. */
export function normPath(t: string): string {
  if (/^(src|scripts|test|sessions)\//.test(t) || t === 'vite.config.ts') return t;
  if (t.startsWith('design/') || t.startsWith('harness/') || t.startsWith('probe/')) return `sessions/widegrid-perf-2026-11/${t}`;
  return `src/core/${t}`;
}

/**
 * 표 줄을 칸으로 자른다. 백틱 안의 `|` 는 칸 경계가 아니다 — 설계서 §5-나 S0 줄에
 * `HTMLElement|Element|Node|…` 처럼 백틱 속 `|` 가 실제로 있다(T0 에 발견, 단순 split 은 S0 칸을 잘못 자름).
 */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inTick = false;
  for (const ch of line) {
    if (ch === '`') inTick = !inTick;
    if (ch === '|' && !inTick) { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells.slice(1, -1).map(s => s.trim());
}

export interface OwnerEntry { pattern: string; lane: Lane; timeBound: boolean }

/** §5-가 레인 표 → (경로 또는 접두 `dir/*`, 레인). STR 의 「S1 동안만」 몫은 timeBound=true 로 표시. */
export function extractOwnerTable(md: string = readFileSync(DESIGN_MD, 'utf8')): OwnerEntry[] {
  const lines = md.split('\n');
  const entries: OwnerEntry[] = [];
  for (const lane of LANES) {
    const row = lines.find(l => l.startsWith(`| **${lane}** `));
    if (!row) throw new Error(`§5-가 에서 레인 줄을 못 찾음: ${lane}`);
    const cell = splitRow(row)[2] ?? '';
    const [perm, s1] = lane === 'STR' ? cell.split('**S1 동안만**') : [cell, ''];
    for (const t of pathTokens(perm ?? '')) entries.push({ pattern: normPath(t), lane, timeBound: false });
    for (const t of pathTokens(s1 ?? '')) entries.push({ pattern: normPath(t), lane, timeBound: true });
  }
  return entries;
}

export interface StepFileRef { step: string; path: string; raw: string }

/**
 * §5-나 걸음 표의 「바꾸는 파일·클래스(레인)」 칸에서 백틱 경로를 뽑는다(재검토 N7).
 * 경로가 아니라 클래스 이름만 적힌 칸(예: `FlatRowModel`)은 `src/core/**` 에서 같은 이름 파일이 하나뿐일 때
 * 그 파일로 푼다 — 클래스 이름 → 파일 매핑은 `resolveClassToken` 이 맡는다.
 */
export function extractStepFiles(md: string = readFileSync(DESIGN_MD, 'utf8')): StepFileRef[] {
  const lines = md.split('\n');
  const head = lines.findIndex(l => l.startsWith('### 5-나.'));
  const end = lines.findIndex((l, i) => i > head && l.startsWith('### 5-다.'));
  if (head < 0 || end < 0) throw new Error('§5-나 범위를 못 찾음');
  const refs: StepFileRef[] = [];
  for (const line of lines.slice(head, end)) {
    if (!line.startsWith('| ')) continue;
    const cells = splitRow(line);
    const step = (cells[0] ?? '').replace(/\*/g, '').trim();
    if (!step || step === '걸음' || /^-+$/.test(step)) continue;
    const cell = cells[2] ?? '';
    for (const m of cell.matchAll(/`([^`]+)`/g)) refs.push({ step, path: '', raw: m[1]!.trim() });
  }
  return refs;
}

export interface ClassCard { id: string; names: string[]; files: string[] }

/**
 * §3-2·§3-3 클래스 카드의 「이름」·「파일」 칸 → (클래스 이름들, 파일 경로들).
 * 「파일」 칸의 둘째 이후 낱말이 이름만 있으면(`SortKeyStore.ts`) 첫 경로의 폴더를 붙인다.
 */
export function extractClassCards(md: string = readFileSync(DESIGN_MD, 'utf8')): ClassCard[] {
  const lines = md.split('\n');
  const from = lines.findIndex(l => l.startsWith('### 3-2.'));
  const to = lines.findIndex((l, i) => i > from && l.startsWith('### 3-4.'));
  if (from < 0 || to < 0) throw new Error('§3-2~3-3 범위를 못 찾음');
  const cards: ClassCard[] = [];
  for (const line of lines.slice(from, to)) {
    if (!line.startsWith('| ')) continue;
    const c = splitRow(line);
    if (!/^[A-Z]{1,2}\d+/.test(c[0] ?? '')) continue;
    const names = [...(c[1] ?? '').matchAll(/`([A-Za-z][\w]*)`/g)].map(m => m[1]!);
    const files: string[] = [];
    let dir = '';
    for (const m of (c[2] ?? '').matchAll(/`([^`]+)`/g)) {
      const t = m[1]!.trim();
      if (!/\.(ts|css)$/.test(t)) continue;
      const p = t.includes('/') ? normPath(t) : dir ? `${dir}/${t}` : normPath(t);
      dir = p.slice(0, p.lastIndexOf('/'));
      files.push(p);
    }
    cards.push({ id: c[0]!, names, files });
  }
  return cards;
}

let _srcFiles: string[] | null = null;
export function gitSrcFiles(): string[] {
  if (!_srcFiles) _srcFiles = git('ls-files src').trim().split('\n').filter(Boolean);
  return _srcFiles;
}

let _allFiles: string[] | null = null;
function gitAllFiles(): string[] {
  if (!_allFiles) _allFiles = git('ls-files src scripts test').trim().split('\n').filter(Boolean);
  return _allFiles;
}

export type TokenKind = 'path' | 'file' | 'class' | 'planned-class' | 'none';

/**
 * 걸음 칸의 백틱 낱말 하나를 저장소 경로로 푼다.
 * ① 경로꼴(`render/X.ts`, `GridComposer.ts:405·419` 의 줄 번호는 떼어 냄) → 경로
 * ② 슬래시 없는 파일 이름(`archCheck.ts`) → git 에 그 이름 파일이 하나뿐이면 그 파일
 * ③ 클래스 이름(`DataLayer.applySort`·`FlatRowModel`) → `src/core` 에 같은 이름 .ts 가 하나면 그 파일
 * ④ 아직 없는 새 클래스(`ExtraColumns`) → 레인 표에 같은 이름 파일이 하나 있으면 그 계획 경로
 */
export function resolveStepToken(raw: string, owners: OwnerEntry[] = [], cards: ClassCard[] = []): { path: string | null; kind: TokenKind } {
  let t = raw.replace(/\(.*$/, '').trim();
  t = t.replace(/:[\d·~,\s]+$/, ''); // 「File.ts:405·419」 → 「File.ts」
  const uniq = (xs: string[]) => [...new Set(xs)];
  if (/^[\w.*-]+\.(ts|mjs|css)$/.test(t) && !t.includes('/')) {
    const hits = gitAllFiles().filter(f => f.endsWith(`/${t}`));
    if (hits.length === 1) return { path: hits[0]!, kind: 'file' };
    const planned = uniq(owners.filter(o => o.pattern.endsWith(`/${t}`)).map(o => o.pattern));
    if (planned.length === 1) return { path: planned[0]!, kind: 'file' };
  }
  if (/^[\w./*-]+\.(ts|mjs|css)$/.test(t) || /^[\w./-]+\/\*$/.test(t)) return { path: normPath(t), kind: 'path' };
  const m = /^([A-Z][A-Za-z0-9]+)(?:\.[\w$]+)?$/.exec(t);
  if (m) {
    const hits = gitSrcFiles().filter(f => f.startsWith('src/core/') && f.endsWith(`/${m[1]}.ts`));
    if (hits.length === 1) return { path: hits[0]!, kind: 'class' };
    const planned = uniq([
      ...owners.filter(o => o.pattern.endsWith(`/${m[1]}.ts`)).map(o => o.pattern),
      ...cards.filter(c => c.names.includes(m[1]!)).map(c => c.files.find(f => f.endsWith(`/${m[1]}.ts`)) ?? (c.files.length === 1 ? c.files[0]! : '')).filter(Boolean),
    ]);
    if (planned.length === 1) return { path: planned[0]!, kind: 'planned-class' };
  }
  return { path: null, kind: 'none' };
}

/** git 에 올라 있는 파일인가(src·scripts·vite.config.ts). */
export function isTrackedFile(p: string): boolean {
  return p === 'vite.config.ts' ? true : gitAllFiles().includes(p);
}

export function ownersOf(file: string, entries: OwnerEntry[], opts: { includeTimeBound?: boolean } = {}): Lane[] {
  const r = new Set<Lane>();
  for (const e of entries) {
    if (e.timeBound && !opts.includeTimeBound) continue;
    const hit = e.pattern.endsWith('/*') ? file.startsWith(e.pattern.slice(0, -1)) :
      e.pattern.endsWith('/**') ? file.startsWith(e.pattern.slice(0, -2)) : e.pattern === file;
    if (hit) r.add(e.lane);
  }
  // 계약 사본: domain/sort/ports.ts 는 STR(파일 단위 예외 — 설계서 §5-가 3번)
  if (file === 'src/core/domain/sort/ports.ts' && r.has('STR')) r.delete('SORT');
  return [...r];
}

/**
 * 설계서 문구가 「언급만 하고 고치지 않는다」고 밝힌 기존 파일. 걸음 칸에 이름이 나오지만 바꾸는 파일이 아니다.
 * 테스트가 그 문구가 설계서에 실제로 있는지 같이 확인한다(문서가 바뀌면 이 예외도 빨개진다).
 */
export const MENTION_ONLY: Record<string, { step: string; stepPhrase: string; lanePhrase?: string }> = {
  // C0 칸은 「기존 `FormulaStore.size()===0`」(있는 메서드를 부름), VP 레인 칸은 「저장소 파일은 안 고침」
  'src/core/formula/FormulaStore.ts': { step: 'C0', stepPhrase: '기존 `FormulaStore.size()===0`', lanePhrase: '저장소 파일은 안 고침' },
  // S0 칸: 기존 헤드리스 파일의 지금 낱말은 「고치지 않고 규칙 밖」(rev3 P1) — 「둘 다 주인 없음」이라고 설계서가 밝힘
  'src/core/appearance/AppearanceProvider.ts': { step: 'S0', stepPhrase: '**고치지 않고 규칙 밖**' },
  'src/core/chart/types.ts': { step: 'S0', stepPhrase: '**고치지 않고 규칙 밖**' },
};

export interface OwnerCheck {
  gitSrcFiles: number;
  ownerEntries: number;
  stepTokens: number;
  tokenKinds: Record<TokenKind, number>;
  touchedExisting: { path: string; steps: string[]; owners: Lane[] }[];
  touchedPlanned: { path: string; steps: string[]; owners: Lane[] }[];
  classCardFiles: { path: string; card: string; owners: Lane[] }[];
  unresolvedClassTokens: string[];
  duplicateOwners: { path: string; owners: Lane[] }[];
  touchedExistingWithoutOwner: string[];
  mentionOnly: string[];
  plannedWithoutOwner: string[];
}

export function computeOwnerCheck(md: string = readFileSync(DESIGN_MD, 'utf8')): OwnerCheck {
  const entries = extractOwnerTable(md);
  const cards = extractClassCards(md);
  const steps = extractStepFiles(md);
  const resolved = steps.map(s => ({ ...s, ...resolveStepToken(s.raw, entries, cards) }));
  const touched = new Map<string, Set<string>>();
  for (const r of resolved) {
    if (!r.path || r.path.endsWith('*')) continue;
    if (!touched.has(r.path)) touched.set(r.path, new Set());
    touched.get(r.path)!.add(r.step);
  }
  const existing = [...touched.keys()].filter(isTrackedFile).sort();
  const planned = [...touched.keys()].filter(p => !isTrackedFile(p)).sort();
  const cardFiles = cards.flatMap(c => c.files.map(f => ({ path: f, card: c.id })));
  const universe = [...new Set([...gitAllFiles(), 'vite.config.ts', ...planned, ...cardFiles.map(c => c.path),
    ...entries.filter(e => !e.pattern.endsWith('*')).map(e => e.pattern)])].sort();
  const duplicateOwners = universe.map(path => ({ path, owners: ownersOf(path, entries) })).filter(x => x.owners.length > 1);
  const noOwner = existing.filter(f => ownersOf(f, entries).length === 0);
  const mentionOnly = noOwner.filter(f => {
    const m = MENTION_ONLY[f];
    if (!m) return false;
    const rows = md.split('\n');
    const stepRow = rows.find(l => l.startsWith(`| **${m.step}** `));
    const laneOk = !m.lanePhrase || rows.some(l => /^\| \*\*[A-Z]+\*\* /.test(l) && l.includes(m.lanePhrase!));
    return !!stepRow && stepRow.includes(m.stepPhrase) && laneOk;
  });
  const kinds = { path: 0, file: 0, class: 0, 'planned-class': 0, none: 0 } as Record<TokenKind, number>;
  for (const r of resolved) kinds[r.kind]++;
  const plannedAll = [...new Set([...planned, ...cardFiles.map(c => c.path).filter(p => !isTrackedFile(p))])].sort();
  return {
    gitSrcFiles: gitSrcFiles().length,
    ownerEntries: entries.length,
    stepTokens: steps.length,
    tokenKinds: kinds,
    touchedExisting: existing.map(path => ({ path, steps: [...touched.get(path)!].sort(), owners: ownersOf(path, entries) })),
    touchedPlanned: planned.map(path => ({ path, steps: [...touched.get(path)!].sort(), owners: ownersOf(path, entries, { includeTimeBound: true }) })),
    classCardFiles: cardFiles.map(c => ({ ...c, owners: ownersOf(c.path, entries, { includeTimeBound: true }) })),
    unresolvedClassTokens: [...new Set(resolved.filter(r => r.kind === 'none' && /^[A-Z][A-Za-z0-9]+(\.\w+)?$/.test(r.raw)).map(r => `${r.step}:${r.raw}`))],
    duplicateOwners,
    touchedExistingWithoutOwner: noOwner.filter(f => !mentionOnly.includes(f)),
    mentionOnly,
    plannedWithoutOwner: plannedAll.filter(p => ownersOf(p, entries, { includeTimeBound: true }).length === 0),
  };
}

// ── AR-20: 공개 API 목록(타입 검사기로 뽑음) ────────────────────────────────────────────────
let _program: ts.Program | null = null;
function program(): ts.Program {
  if (_program) return _program;
  const cfgPath = resolve(REPO, 'tsconfig.json');
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, REPO);
  _program = ts.createProgram([resolve(REPO, 'src/index.ts')], { ...parsed.options, noEmit: true });
  return _program;
}

function kindOf(sym: ts.Symbol): string {
  const f = sym.flags;
  if (f & ts.SymbolFlags.Class) return 'class';
  if (f & ts.SymbolFlags.Function) return 'function';
  if (f & ts.SymbolFlags.Enum) return 'enum';
  if (f & ts.SymbolFlags.Variable) return 'const';
  if (f & ts.SymbolFlags.Interface) return 'interface';
  if (f & ts.SymbolFlags.TypeAlias) return 'type';
  return 'other';
}

/** `src/index.ts` 가 내보내는 이름 전부(값·형) — `이름\t종류` 정렬 목록. */
export function indexExports(): string[] {
  const p = program();
  const checker = p.getTypeChecker();
  const sf = p.getSourceFile(resolve(REPO, 'src/index.ts'));
  if (!sf) throw new Error('src/index.ts 를 프로그램에서 못 찾음');
  const modSym = checker.getSymbolAtLocation(sf);
  if (!modSym) throw new Error('src/index.ts 모듈 심볼 없음');
  return checker.getExportsOfModule(modSym).map(s => {
    const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
    return `${s.getName()}\t${kindOf(target)}`;
  }).sort();
}

function findInterface(file: string, name: string): ts.InterfaceDeclaration | ts.ClassDeclaration {
  const sf = program().getSourceFile(resolve(REPO, file));
  if (!sf) throw new Error(`${file} 가 프로그램에 없음`);
  let found: ts.InterfaceDeclaration | ts.ClassDeclaration | undefined;
  sf.forEachChild(n => {
    if ((ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n)) && n.name?.text === name) found = n;
  });
  if (!found) throw new Error(`${file} 에 ${name} 없음`);
  return found;
}

/** 인터페이스(상속 포함)의 속성 이름 정렬 목록 — 옵션 키·이벤트 이름·RenderContext 키에 쓴다. */
export function interfaceKeys(file: string, name: string): string[] {
  const decl = findInterface(file, name);
  const checker = program().getTypeChecker();
  const type = checker.getTypeAtLocation(decl);
  return checker.getPropertiesOfType(type).map(s => s.getName()).sort();
}

/**
 * 클래스의 공개(비공개·보호·밑줄 아님) **함수 아닌** 멤버 — 게터·공개 필드.
 * 기존 public-api-surface 시험은 함수만 지키므로 이것이 더하는 몫이다.
 */
export function classPublicNonMethods(file: string, name: string): string[] {
  const decl = findInterface(file, name) as ts.ClassDeclaration;
  const out: string[] = [];
  for (const m of decl.members) {
    const mods = ts.canHaveModifiers(m) ? ts.getModifiers(m) ?? [] : [];
    if (mods.some(x => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword)) continue;
    if (!m.name || !ts.isIdentifier(m.name)) continue;
    const n = m.name.text;
    if (n.startsWith('_')) continue;
    if (ts.isGetAccessor(m)) out.push(`get ${n}`);
    else if (ts.isSetAccessor(m)) out.push(`set ${n}`);
    else if (ts.isPropertyDeclaration(m)) {
      const isStatic = mods.some(x => x.kind === ts.SyntaxKind.StaticKeyword);
      out.push(`${isStatic ? 'static ' : ''}prop ${n}`);
    } else if (ts.isMethodDeclaration(m) && mods.some(x => x.kind === ts.SyntaxKind.StaticKeyword)) {
      out.push(`static method ${n}`);
    }
  }
  return [...new Set(out)].sort();
}

// ── 목록 파일 읽기 ─────────────────────────────────────────────────────────────────────────
export function readGoldenLines(name: string): string[] {
  const p = join(GOLDEN_DIR, name);
  if (!existsSync(p)) throw new Error(`골든 목록 없음: ${p}`);
  return readFileSync(p, 'utf8').split('\n').map(s => s.replace(/\r$/, '')).filter(s => s && !s.startsWith('#'));
}

/** 주석을 지운 소스(문자열 안은 그대로 둠 — 정규식 검사 전에 주석 속 낱말이 걸리지 않게). */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}
