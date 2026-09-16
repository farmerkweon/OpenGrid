/**
 * 테마 12칸 · 헤더 축 코어 적용의 **인수 게이트**.
 *
 * 개발자 에이전트가 구현한 결과물이 지시서 SE_BRIEF_CORE.md §2 「지켜야 할 선」을 지켰는지를
 * 사람 눈이 아니라 기계로 판정한다. 아직 없는 산출물(header.css 등)은 skip 되고, 파일이 착지하는
 * 순간 자동으로 활성화된다(래칫).
 *
 * 각 테스트는 「무엇을」이 아니라 **「왜 이게 깨지면 안 되는가」** 를 실패 메시지에 담는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(__dirname, '../../..');
// 기준 브랜치: 작업장은 master, 공개 저장소는 main 이다. 없는 이름을 고정하면 기준을 못 읽어
// 선존 누락까지 「새 누락」으로 세어 실패한다(공개 저장소 CI 에서 실제로 걸렸다).
const BASELINE_REFS = process.env.OG_BASELINE_REF ? [process.env.OG_BASELINE_REF] : ['master', 'main', 'HEAD'];

const read = (p: string): string | null =>
  existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), 'utf8') : null;

const gitShow = (p: string): string | null => {
  for (const ref of BASELINE_REFS) {
    try {
      return execFileSync('git', ['show', ref + ':' + p], {
        cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch { /* 다음 기준 브랜치 */ }
  }
  return null;
};

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** [data-og-theme="id"] 블록별 토큰 표. */
function themeTokens(css: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const m of stripComments(css).matchAll(/\[data-og-theme="([a-z0-9-]+)"\][^{]*\{([^}]*)\}/gi)) {
    const bucket = out.get(m[1]) ?? new Map<string, string>();
    for (const d of m[2].matchAll(/(--og-[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      bucket.set(d[1], d[2].replace(/\s+/g, ' ').trim());
    }
    out.set(m[1], bucket);
  }
  return out;
}

/**
 * 동결 대상 「고전 15종」.
 *
 * 지시서 §2 ②「기존 15종 hex 불변」의 15가 무엇인지 지시서엔 명단이 없다. 실물에서 유도했다 —
 * themes.css 27종에서 지난 트랙(커밋 ca39cd7, 2026-08-03)이 넣은 12종을 빼면 **정확히 15개**가 남는다.
 * 그 15개만 v1.4.0(2026-07-17 발행)에 실려 사용자에게 갔다. 나머지 12칸은 저장소에만 있는 미배포분이라
 * 값을 갈아끼워도 사용자 화면이 바뀌지 않는다(확인 2026-08-08: "지금 것으로 갈아끼워줘").
 */
const FROZEN_15 = [
  'default', 'dark', 'modern', 'executive', 'ocean', 'purple', 'indigo', 'amber',
  'forest', 'sunset', 'rose', 'teal', 'slate', 'crimson', 'stitch',
] as const;

describe('지켜야 할 선 ② — 고전 15종의 색 값은 한 글자도 안 바뀐다', () => {
  const beforeCss = gitShow('src/styles/themes.css');
  const afterCss = read('src/styles/themes.css');

  it.skipIf(beforeCss === null || afterCss === null)('15종 전수 토큰 대조', () => {
    const before = themeTokens(beforeCss as string);
    const after = themeTokens(afterCss as string);
    const broken: string[] = [];

    for (const id of FROZEN_15) {
      const a = before.get(id);
      const b = after.get(id);
      if (!a) continue;
      if (!b) { broken.push(id + ': 테마 블록이 통째로 사라졌다'); continue; }
      for (const [tok, val] of a) {
        const now = b.get(tok);
        if (now === undefined) broken.push(id + ' ' + tok + ': 선언이 사라졌다 (' + val + ')');
        else if (now !== val) broken.push(id + ' ' + tok + ': ' + val + ' → ' + now);
      }
    }

    expect(
      broken,
      '고전 15종은 이미 배포된(v1.4.0) 테마다. 색 값을 바꾸면 기존 사용자 화면이 예고 없이 바뀐다.\n' +
      '이번 작업은 배선만 고치기로 한 것이다. 위 목록을 되돌려라.',
    ).toEqual([]);
  });

  it.skipIf(afterCss === null)('고전 15종이 전부 살아 있다', () => {
    const ids = new Set(themeTokens(afterCss as string).keys());
    const missing = FROZEN_15.filter((t) => !ids.has(t));
    expect(missing, '동결 대상 테마가 사라졌다.').toEqual([]);
  });
});

describe('테마 메타 정합성 — darkPair 가 실재하는 테마를 가리켜야 한다', () => {
  const metaSrc = read('src/core/appearance/ThemeMetaRegistry.ts');
  const themesCss = read('src/styles/themes.css');

  it.skipIf(metaSrc === null || themesCss === null)(
    'darkPair 로 지목된 id 가 themes.css 에 실재 — 유령 짝 금지',
    () => {
      const ids = new Set(themeTokens(themesCss as string).keys());
      const dangling: string[] = [];
      const re = /id:\s*'([a-z0-9-]+)'[^}]*darkPair:\s*'([a-z0-9-]+)'/gi;
      for (const m of (metaSrc as string).matchAll(re)) {
        if (!ids.has(m[2])) dangling.push(m[1] + '.darkPair = ' + m[2] + ' 인데 themes.css 에 그 테마가 없다');
      }
      expect(
        dangling,
        '테마를 지우면서 그것을 darkPair 로 참조하던 메타를 안 고쳤다.\n' +
        '특히 ocean 은 동결 대상 고전 15종이다 — 그 짝인 ocean-dark 를 지우려면\n' +
        'ThemeMetaRegistry 의 ocean 항목에서 darkPair 를 함께 지우거나 다른 어두운 짝으로 옮겨야 한다.',
      ).toEqual([]);
    },
  );

  it.skipIf(metaSrc === null || themesCss === null)(
    '메타에 등록된 테마 id 가 전부 themes.css 에 실재 — 유령 메타 금지',
    () => {
      const ids = new Set(themeTokens(themesCss as string).keys());
      const ghosts = [...(metaSrc as string).matchAll(/id:\s*'([a-z0-9-]+)'\s*,\s*dark:/gi)]
        .map((m) => m[1])
        .filter((id) => !ids.has(id));
      expect(
        ghosts,
        '실물 CSS 블록 없는 메타는 linen 때 이미 한 번 문제가 됐다(SPEC §1.1).\n' +
        '테마를 지웠으면 BUILTIN_THEME_METAS 에서도 지우고, 새로 넣었으면 여기도 넣어라.',
      ).toEqual([]);
    },
  );

  it.skipIf(metaSrc === null || themesCss === null)(
    'themes.css 의 테마 중 메타 없는 것이 기준보다 늘지 않는다 — 래칫',
    () => {
      // ⚠ 선존 결함: 고전 테마 11종(forest·sunset·purple…)은 원래부터 메타가 없다.
      //    이번 작업의 책임이 아니므로 0을 요구하지 않는다. 대신 **늘어나는 것**만 막는다.
      //    (신규 3칸을 넣으면서 BUILTIN_THEME_METAS 를 안 고치면 여기서 걸린다.)
      const metaIdsOf = (src: string) =>
        new Set([...src.matchAll(/id:\s*'([a-z0-9-]+)'\s*,\s*dark:/gi)].map((m) => m[1]));
      const gapOf = (metaSource: string, cssSource: string) => {
        const ids = metaIdsOf(metaSource);
        return [...themeTokens(cssSource).keys()].filter((id) => !ids.has(id));
      };
      const baseMeta = gitShow('src/core/appearance/ThemeMetaRegistry.ts');
      const baseCss = gitShow('src/styles/themes.css');
      const beforeGap = new Set(baseMeta && baseCss ? gapOf(baseMeta, baseCss) : []);
      const afterGap = gapOf(metaSrc as string, themesCss as string);
      const newGaps = afterGap.filter((id) => !beforeGap.has(id));
      expect(
        newGaps,
        'CSS 에는 있는데 BUILTIN_THEME_METAS 에 없는 테마가 새로 생겼다.\n' +
        '조합 판정(dark 짝·질감성)이 이 테마를 모른다 — 신규 칸을 넣으면서 메타를 빠뜨렸을 것이다.\n' +
        '선존 누락 ' + beforeGap.size + '건은 이 작업의 책임이 아니라 제외했다.',
      ).toEqual([]);
    },
  );
});

describe('A-1 짝 강제 — 누수 고침과 안전판은 반드시 함께 있어야 한다', () => {
  const css = read('src/styles/base.css');

  it.skipIf(css === null)('둘 중 하나만 있으면 실패 — 중간 상태가 오늘보다 나쁘다', () => {
    const s = stripComments(css as string);
    const hasA1 = /--og-row-accent-color:\s*var\(--og-primary\)/.test(s.split(/\.og-container\s*\{/).slice(1).join('{'));
    const hasGuard = /--og-row-accent-color:\s*var\(--og-row-selected-color\)/.test(s);

    if (!hasA1 && !hasGuard) return; // A-1 미적용 상태 — 판정 대상 아님

    expect(
      hasA1 && hasGuard,
      'A-1(#1976d2 누수 고침)과 모션 검토 안전판(모션 검토 문서 §3.1)은 한 덩어리다.\n' +
      'A-1 만 넣으면 고전 10종에서 선택된 행의 hover 막대가 대비 1.00 = 완전 소실된다\n' +
      '(실측 D1_IMPACT.json: ocean 1.19→1.00, sunset 1.32→1.00). 오늘보다 나쁜 중간 상태다.\n' +
      '현재 상태: A-1=' + hasA1 + ', 안전판=' + hasGuard,
    ).toBe(true);
  });
});

describe('헤더 축 CSS 계약', () => {
  const css = read('src/styles/header.css');

  it.skipIf(css === null)('default 프리셋은 규칙을 한 줄도 쓰지 않는다 — 기본값 불변의 구조적 보증', () => {
    const hits = [...stripComments(css as string).matchAll(/\[data-og-header\s*=\s*"default"\]/gi)];
    expect(
      hits.map((h) => h[0]),
      'data-og-header="default" 를 겨냥한 규칙이 있다. default 는 축을 켜도 아무 일이 없다가\n' +
      '보증돼야 하며, 그 보증의 근거는 규칙이 0줄이라는 사실이다.\n' +
      '규칙이 생기는 순간 보증이 논증으로 바뀌고, 논증은 틀릴 수 있다.',
    ).toEqual([]);
  });

  it.skipIf(css === null)('새 색(hex)을 만들지 않는다 — 테마 토큰으로부터 유도만 한다', () => {
    const hexes = [...stripComments(css as string).matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
    expect(
      [...new Set(hexes)],
      '헤더 축은 배선을 바꾸는 축이지 색을 만드는 축이 아니다.\n' +
      'hex 를 쓰면 테마 수만큼 대비를 다시 재야 하고 지시서 §2 ②(색 값 불변)와 부딪친다.\n' +
      'var(--og-row-bg) 처럼 테마 토큰에서 유도하라 — 시안 header-new.css 가 그렇게 돼 있다.',
    ).toEqual([]);
  });

  it.skipIf(css === null)('폴백 없는 확장 토큰 참조가 없다 — 기존 테마에서 값이 비지 않게', () => {
    const s = stripComments(css as string);
    const baseCss = read('src/styles/base.css') ?? '';
    const declaredHere = new Set([...s.matchAll(/(--og-[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
    const declaredBase = new Set([...baseCss.matchAll(/^\s*(--og-[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));
    const naked: string[] = [];
    for (const m of s.matchAll(/var\(\s*(--og-[a-z0-9-]+)\s*\)/gi)) {
      if (!declaredHere.has(m[1]) && !declaredBase.has(m[1])) naked.push(m[1]);
    }
    expect(
      [...new Set(naked)],
      '폴백 없이 참조하는데 base.css 에도 이 파일에도 정의가 없는 토큰이다.\n' +
      '신규 칸에만 정의된 토큰이라면 그 밖의 테마에서 값이 비어 헤더가 깨진다.\n' +
      'var(--x, 오늘값) 형태로 적어라 — 시안은 확장 토큰 15개 전부 폴백을 갖고 있었다.',
    ).toEqual([]);
  });

  it.skipIf(css === null)('축 이름공간 고지 — 헤더 축은 색 축 토큰을 재배선한다(정직 표기 강제)', () => {
    const s = css as string;
    const touchesColorAxis = /--og-header-(bg|color|hover-bg|sort-color)\s*:|--og-primary-light\s*:/.test(
      stripComments(s),
    );
    if (!touchesColorAxis) return;
    expect(
      /축 오염|이름공간|색 축|color axis/i.test(s),
      '이 파일은 색 축(테마) 소유 토큰(--og-header-bg 등)을 재선언한다.\n' +
      'AppearanceAxis 의 불변식 1(축 오염 금지)에서 벗어나는 예외이므로,\n' +
      '왜 그래도 되는지(값을 만들지 않고 테마 토큰에서 유도만 한다)를 파일 주석에 남겨라.\n' +
      '주석 없는 예외는 다음 사람이 실수로 따라 한다.',
    ).toBe(true);
  });
});

describe('동명이인 함정 — 테마 ledger 와 타이포 프리셋 ledger 는 다른 것이다', () => {
  const typoCss = read('src/styles/typography.css');
  it.skipIf(typoCss === null)('타이포 프리셋 ledger 는 살아 있어야 한다', () => {
    expect(
      /\[data-og-typography="ledger"\]/.test(typoCss as string),
      '테마 ledger 를 지우면서 이름만 보고 타이포 프리셋 ledger 까지 지운 것으로 보인다.\n' +
      '둘은 다른 축의 다른 값이다. 타이포 내장 프리셋 7종 중 하나이며\n' +
      'typography-axis.test.ts 와 src/typography/index.ts 의 예제가 이것에 의존한다.',
    ).toBe(true);
  });
});

/**
 * 시안 ↔ 코어 등가성 — **인수 게이트**라 기본 실행에서는 건너뛴다.
 *
 * 구현이 진행 중인 동안에는 당연히 어긋나 있으므로 npm test 를 상시 빨갛게 만들면 안 된다.
 * 개발자가 "다 넣었다"고 할 때 검증자가 이 플래그를 켜고 돌려 판정한다:
 *
 *     OG_PROTO_PARITY=1 npx vitest run test/unit/quality/theme-header-axis-contract.test.ts
 *
 * 이 게이트를 안 돌리고 완료 보고를 하면, 시안에서 잰 17조 검사·대비 실측은 코어에 대한 증거가 아니다.
 */
describe('시안 ↔ 코어 등가성 — 시안은 dist 를 읽고 검증됐다', () => {
  const PARITY_ON = process.env.OG_PROTO_PARITY === '1';
  const PROTO = 'sessions/theme-typo-2026-08/proto';
  const pairs: Array<[string, string, string]> = [
    ['테마 12칸', PROTO + '/themes-new.css', 'src/styles/themes.css'],
    ['헤더 축', PROTO + '/header-new.css', 'src/styles/header.css'],
  ];

  for (const [label, protoPath, srcPath] of pairs) {
    const proto = read(protoPath);
    const src = read(srcPath);

    it.skipIf(!PARITY_ON || proto === null || src === null)(
      label + ': 시안이 선언한 토큰이 코어에도 같은 값으로 있다',
      () => {
        const grab = (css: string) => {
          const out = new Map<string, string>();
          const body = stripComments(css);
          for (const m of body.matchAll(/(\[data-og-(?:theme|header)="[a-z0-9-]+"\][^{]*)\{([^}]*)\}/gi)) {
            for (const d of m[2].matchAll(/(--og-[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
              out.set(m[1].trim() + ' ' + d[1], d[2].replace(/\s+/g, ' ').trim());
            }
          }
          return out;
        };
        const p = grab(proto as string);
        const s = grab(src as string);
        const drift: string[] = [];
        for (const [k, v] of p) {
          const now = s.get(k);
          if (now === undefined) drift.push('누락  ' + k + ' = ' + v);
          else if (now !== v) drift.push('불일치 ' + k + ': 시안 ' + v + ' → 코어 ' + now);
        }
        expect(
          drift.slice(0, 40),
          '시안(proto)은 dist 를 읽어 실브라우저로 검증됐다. 코어(src)의 값이 시안과 다르면\n' +
          '그 검증 결과는 코어에 대한 증거가 아니다 — 17조 검사도 대비 실측도 무효가 된다.\n' +
          '옮겨 적다 틀린 것인지, 의도한 조정인지 확인하라. 의도한 조정이면 시안을 함께 고쳐라.\n' +
          '총 ' + drift.length + '건 (앞 40건만 표시)',
        ).toEqual([]);
      },
    );
  }
});
