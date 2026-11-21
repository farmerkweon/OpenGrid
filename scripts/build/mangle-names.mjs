// 비공개 속성 이름표 만들기 — 빌드 압축 단계(minify-plugin.mjs)가 쓰는 `mangleProps`·`mangleCache` 의 근거.
//
// 줄이는 이름 = src 의 TS 클래스에서 `private`/`protected` 로 선언된 `_이름`(필드·메서드·접근자·생성자 매개변수 속성)
// 가운데, 아래 「지킬 이름」이 아닌 것. esbuild 의 mangleProps 는 이름 글자 기준으로 번들 안의 **모든** `.이름` 을
// 바꾸므로, 그 이름이 비공개 멤버가 아닌 곳에서 한 번이라도 쓰이면 지킨다:
//   - 같은 이름의 공개 클래스 멤버, 인터페이스·형 멤버, 객체 글자 키, 구조 분해 키
//   - 형 검사기로 따라가 보니 비공개 멤버가 아닌 것(any·사용자 객체·다른 형)에 닿는 `.이름` 접근
//   - 문자열 글자 안의 `_이름`(대괄호 접근 `['_x']`, `'_x' in o`, `override('_x')` 등 — esbuild 는 따옴표 이름을 안 바꾼다)
//   - 밖(문서·예제·데모·래퍼·e2e)이 읽는 이름: mangle-reserved.json 의 정적 목록
// 표는 결정적이다: 같은 src 와 같은 정적 목록이면 같은 표가 나온다(쓰임 횟수 많은 순, 같으면 이름 순으로 $a, $b …).
// 코어·지연 청크·진입·부가 번들(typography·header·a11y)·react·vue 진입이 같은 src 에서 같은 표를 만들므로
// 청크 사이에서 같은 이름은 같은 짧은 이름이 된다.
//
// Builds the private-property rename table used by the minify plugin (`mangleProps` + a fixed `mangleCache`).
// Mangled = `_name` members declared `private`/`protected` in src TS classes, minus reserved names. esbuild renames
// by spelling across the whole chunk, so a name is reserved if it is used anywhere other than as a private member:
// a public member / interface or type member / object-literal or destructuring key of the same spelling, a `.name`
// access the type checker does not resolve to a private member (any, user objects), any `_name` inside a string
// literal (esbuild leaves quoted names alone), or a name that docs/examples/demos/wrappers/e2e read from outside
// (the static list in mangle-reserved.json). The table is deterministic (frequency desc, then name; values $a, $b …),
// and every build computes it from the same src, so all chunks and add-on bundles agree on each short name.
//
// CLI: node scripts/build/mangle-names.mjs [--src <dir>] [--json <out.json>] [--audit <dir> ...]
import ts from 'typescript';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const NAME_RE = /^_[A-Za-z0-9]\w*$/;
const WORD_RE = /(?:^|[^A-Za-z0-9_$])(_[A-Za-z0-9]\w*)/g;

function walk(dir, re, out = []) {
  if (!existsSync(dir)) return out;
  if (statSync(dir).isFile()) { out.push(dir); return out; }
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, re, out);
    else if (re.test(f)) out.push(p);
  }
  return out;
}

/** 정적 지킴 목록(밖에서 읽는 이름) / static reserve list (names read from outside). */
export function loadStaticReserved() {
  const j = JSON.parse(readFileSync(resolve(here, 'mangle-reserved.json'), 'utf8'));
  return j.names;
}

const isPrivMod = (m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword;
const hasPriv = (node) => !!ts.getModifiers?.(node)?.some(isPrivMod);
const isClassMember = (d) =>
  ts.isPropertyDeclaration(d) || ts.isMethodDeclaration(d) || ts.isGetAccessorDeclaration(d) || ts.isSetAccessorDeclaration(d) || ts.isParameter(d);
const isPrivDecl = (d) => isClassMember(d) && (ts.isParameter(d) || ts.isClassLike(d.parent)) && hasPriv(d);

/**
 * src 에서 이름표를 만든다 / builds the table from src.
 * @param {{ srcDir: string, staticReserved?: Record<string,string> }} o
 * @returns {{ mangle: string[], reserved: Record<string,string[]>, cache: Record<string,string>, privateCount: number, freq: Record<string,number> }}
 */
export function buildMangleTable({ srcDir, staticReserved = loadStaticReserved() }) {
  const files = walk(srcDir, /\.(ts|tsx)$/); // .d.ts(형 보조)도 형 검사에 넣는다 / .d.ts files join the type check
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX, strict: true, noEmit: true, skipLibCheck: true, allowJs: false,
    baseUrl: resolve(srcDir, '..'), paths: { '@/*': [srcDir.split('\\').join('/') + '/*'] },
  });
  const checker = program.getTypeChecker();
  const P = new Set();
  const R = new Map();
  const freq = new Map();
  const addR = (n, why) => { if (!NAME_RE.test(n)) return; if (!R.has(n)) R.set(n, new Set()); R.get(n).add(why); };
  const bump = (n) => freq.set(n, (freq.get(n) || 0) + 1);
  const srcAbs = resolve(srcDir);
  for (const sf of program.getSourceFiles()) {
    if (!resolve(sf.fileName).startsWith(srcAbs)) continue;
    const rel = relative(srcAbs, sf.fileName).split('\\').join('/');
    const at = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const visit = (node) => {
      // 문자열 글자 안의 `_이름` / `_name` inside string-ish literals
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        for (const m of node.text.matchAll(WORD_RE)) addR(m[1], 'string ' + at(node));
      }
      const nm = node.name;
      const nameText = nm && (ts.isIdentifier(nm) || ts.isPrivateIdentifier(nm)) ? nm.text : nm && ts.isStringLiteral(nm) ? nm.text : undefined;
      if (nameText && NAME_RE.test(nameText)) {
        if (ts.isParameter(node)) {
          // 생성자 매개변수 속성만 멤버다 / only constructor parameter properties are members
          if (ts.isConstructorDeclaration(node.parent) && ts.getModifiers(node)?.length) {
            if (hasPriv(node) && ts.isIdentifier(nm)) { P.add(nameText); bump(nameText); } else addR(nameText, 'public-member ' + at(node));
          }
        } else if (isClassMember(node) && ts.isClassLike(node.parent)) {
          if (hasPriv(node) && ts.isIdentifier(nm)) { P.add(nameText); bump(nameText); } else addR(nameText, 'public-member ' + at(node));
        } else if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) addR(nameText, 'type-member ' + at(node));
        else if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || (isClassMember(node) && ts.isObjectLiteralExpression(node.parent))) addR(nameText, 'object-key ' + at(node));
        else if (ts.isEnumMember(node)) addR(nameText, 'enum-member ' + at(node));
      }
      if (ts.isBindingElement(node)) {
        const key = node.propertyName ?? node.name;
        if (ts.isIdentifier(key) && NAME_RE.test(key.text) && ts.isObjectBindingPattern(node.parent)) addR(key.text, 'destructure ' + at(node));
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name) && NAME_RE.test(node.name.text)) {
        const n = node.name.text;
        bump(n);
        const sym = checker.getSymbolAtLocation(node.name);
        const decls = sym?.declarations ?? [];
        if (decls.length === 0) addR(n, 'untyped-access ' + at(node));
        else if (!decls.every(isPrivDecl)) addR(n, 'nonprivate-access ' + at(node));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  // .vue SFC 는 TS 프로그램 밖 — 글자로 훑어 쓰인 `_이름` 은 지킨다 / .vue files: reserve every `_name` they mention
  for (const f of walk(srcDir, /\.vue$/)) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(WORD_RE)) addR(m[1], 'vue ' + relative(srcAbs, f).split('\\').join('/'));
  }
  for (const [n, why] of Object.entries(staticReserved)) addR(n, 'static: ' + why);
  const mangle = [...P].filter((n) => !R.has(n)).sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0) || (a < b ? -1 : 1));
  // 짧은 이름: `$` + a-zA-Z 기수 — 진짜 속성 이름은 `$` 로 시작하지 않는다(아래에서 확인) / `$`-prefixed short names
  const A = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const short = (i) => { let s = ''; do { s = A[i % 52] + s; i = Math.floor(i / 52) - 1; } while (i >= 0); return '$' + s; };
  const cache = {};
  mangle.forEach((n, i) => { cache[n] = short(i); });
  // `$` 로 시작하는 속성 이름이 src 에 있으면 부딪칠 수 있으니 멈춘다 / stop if src already has a `$`-prefixed property
  const used = new Set(Object.values(cache));
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\.(\$[A-Za-z]+)\b|[{,]\s*(\$[A-Za-z]+)\s*:|['"`](\$[A-Za-z]+)['"`]/g)) {
      const n = m[1] || m[2] || m[3];
      if (used.has(n)) throw new Error(`mangle-names: short name ${n} collides with a property in ${f}`);
    }
  }
  const reserved = {};
  for (const n of [...R.keys()].sort()) reserved[n] = [...R.get(n)].slice(0, 4);
  return { mangle, reserved, cache, privateCount: P.size, privateNames: [...P].sort(), freq: Object.fromEntries([...freq].sort()) };
}

/** 밖(문서·예제·데모 …)에서 읽는 `_이름` 찾기 / finds `_name`s read from outside dirs. */
export function auditOutside(dirs, candidates) {
  const hits = {};
  const re = /\.(_[A-Za-z0-9]\w*)|['"`](_[A-Za-z0-9]\w*)['"`]|override\w*\(\s*['"`](_[A-Za-z0-9]\w*)/g;
  for (const d of dirs) for (const f of walk(d, /\.(ts|tsx|js|mjs|cjs|jsx|vue|php|html|md|json)$/)) {
    if (/\.min\.js$|open-grid[^/\\]*\.(c?js)$|OpenGrid-[\w-]{8}\.c?js$/.test(f)) continue;
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(re)) {
      const n = m[1] || m[2] || m[3];
      if (!candidates.has(n)) continue;
      (hits[n] ||= new Set()).add(f.split('\\').join('/'));
    }
  }
  return Object.fromEntries(Object.entries(hits).sort().map(([n, s]) => [n, [...s]]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const srcDir = resolve(get('--src') || resolve(here, '../../src'));
  const t0 = Date.now();
  const t = buildMangleTable({ srcDir });
  const ms = Date.now() - t0;
  const audit = a.includes('--audit') ? a.slice(a.indexOf('--audit') + 1).filter((x) => !x.startsWith('--')) : null;
  const out = { srcDir, ms, privateCount: t.privateCount, privateNames: t.privateNames, mangleCount: t.mangle.length, reservedPrivate: Object.fromEntries(Object.entries(t.reserved)), cache: t.cache, freq: t.freq };
  if (audit) out.outside = auditOutside(audit, new Set([...t.mangle, ...Object.keys(t.reserved)]));
  if (get('--json')) writeFileSync(get('--json'), JSON.stringify(out, null, 1));
  console.log(`private ${t.privateCount} · mangle ${t.mangle.length} · reserved(all _names) ${Object.keys(t.reserved).length} · ${ms}ms`);
  if (audit) console.log('outside hits on mangle candidates:', Object.keys(out.outside).filter((n) => t.cache[n]).join(' ') || '(none)');
}
