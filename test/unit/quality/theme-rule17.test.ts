/**
 * 「12칸 공통 규칙 v1」 5층 17조 — **신규 12칸 전용 회귀 게이트**.
 *
 * 결정 D-9(2026-08-08): *"a,b,c 선택에 맞추어 정직하게"* 의 2번 항목이다.
 * 시안 단계에서 `_check17.mjs` 로 「위반 0」을 확인했지만, 그건 **그때 한 번 잰 것**이라
 * 다음 사람이 값을 하나 고치면 조용히 깨진다. 그래서 게이트로 못박는다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ 무엇을 재고 무엇을 안 재는지 — 이 주석이 이 파일에서 가장 중요하다
 *
 *   재는 것    신규 12칸(graphite·high-contrast·washi·plain·field·clinical·
 *              high-contrast-dark·blueprint·nocturne·graphite-dark·sentinel·ticker)의 **17조 전항**
 *   안 재는 것 **고전 15종**(default·dark·ocean·forest·sunset·purple·rose·teal·indigo·
 *              amber·slate·crimson·executive·modern·stitch)
 *
 *   왜 고전 15종을 빼는가. 그 15종은 이미 v1.4.0 으로 나갔고, 이번 트랙의 금지선이
 *   **"기존 15종의 색 값은 한 글자도 안 바꾼다"** 이다. 고칠 수 없는 것에 게이트를 걸면
 *   그날부터 `npm test` 가 대량으로 빨개지고, 사람은 빨간 게이트를 곧 무시하게 된다.
 *   **고전 15종은 「6항목(WCAG 대비)만 통과한 상태」이며 17조는 잰 적이 없다.**
 *   이건 결함이 아니라 **아직 안 한 일**이고, 고칠지 말지는 별건 판단으로 남아 있다.
 *   (실측 근거: `sessions/theme-unanimous-2026-08/` 의 build-proto 게이트는 대비 6항목만 본다)
 *
 *   그래서 이 게이트가 초록이어도 **"27종 전부가 17조를 통과했다"는 뜻이 아니다.**
 *   12종이 통과했고 15종은 안 쟀다는 뜻이다. 이 파일은 그 사실을 숨기지 않으려고 쓴 것이다.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **검사기를 다시 짜지 않았다.** 17조 계산기는 `sessions/theme-unanimous-2026-08/_check17.mjs`
 * 하나뿐이고(검증용으로 따로 만들었다), 여기서는 그것을 **그대로 돌린다**. 계산을 TS 로 옮겨 적으면
 * 두 벌이 되어 서로 갈라진다 — 갈라지는 순간 어느 쪽이 참인지 아무도 모른다.
 *
 * **입력을 왜 합치는가.** `_check17.mjs` 는 폴더 하나에서 `themes-new.css` 한 파일을 읽는다.
 * 그런데 코어에서는 제17조가 요구하는 파생 토큰 재선언(`--og-row-accent-color`·`--og-spinner-color`)이
 * **`base.css` 의 `.og-container` 블록**에 있고 색 값은 `themes.css` 에 있다. 둘을 이어 붙여 먹인다.
 * `themes.css` 만 먹이면 제17조 2건이 **오탐**으로 뜬다 — 게이트를 통과시키려고 입력을 고른 것이 아니라,
 * 검사기가 전제하는 「한 파일에 모인 CSS」를 코어 구조에서 재구성한 것이다.
 *
 * **검사기 자체도 검사한다**(품질 검토 §2.2 뮤테이션). "통과했다"는 검사기가 눈이 멀었을 때도 나온다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(__dirname, '../../..');
const CHECKER = resolve(ROOT, 'sessions/theme-unanimous-2026-08/_check17.mjs');
const BASE = resolve(ROOT, 'src/styles/base.css');
const THEMES = resolve(ROOT, 'src/styles/themes.css');

/** 신규 12칸 명단 — 검사기가 이 12개만 집는 것이 정상이다(고전 15종은 주석 양식이 달라 안 잡힌다). */
const NEW_12 = [
  'graphite', 'high-contrast', 'washi', 'plain', 'field', 'clinical',
  'high-contrast-dark', 'blueprint', 'nocturne', 'graphite-dark', 'sentinel', 'ticker',
] as const;

/** 검사기를 돌리고 마지막 요약줄을 판독한다. */
function runChecker(css: string): { themes: number; violations: number; stdout: string } {
  const dir = mkdtempSync(join(tmpdir(), 'og-rule17-'));
  try {
    writeFileSync(join(dir, 'themes-new.css'), css, 'utf8');
    const stdout = execFileSync(process.execPath, [CHECKER, dir], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    // 마지막 줄: "위반 테마 N종 / 총 M종 · 위반 K건"
    const m = stdout.match(/위반 테마 (\d+)종 \/ 총 (\d+)종 · 위반 (\d+)건/);
    if (!m) throw new Error('검사기 출력 형식이 바뀌었다. 이 테스트의 판독 정규식을 함께 고쳐라.\n' + stdout.slice(-500));
    return { themes: Number(m[2]), violations: Number(m[3]), stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ready = existsSync(CHECKER) && existsSync(BASE) && existsSync(THEMES);
const combined = (): string => readFileSync(BASE, 'utf8') + '\n' + readFileSync(THEMES, 'utf8');

describe('17조 게이트 — 신규 12칸만. 고전 15종은 대상이 아니다(안 잰 것을 쟀다고 하지 않는다)', () => {
  it.skipIf(!ready)('검사기가 집는 테마가 정확히 신규 12칸이다', () => {
    const { stdout, themes } = runChecker(combined());
    const seen = stdout
      .split('\n')
      .map((l) => l.split('\t')[0])
      .filter((id) => (NEW_12 as readonly string[]).includes(id));

    expect(
      themes,
      '검사기가 집은 테마 수가 12가 아니다. 둘 중 하나다:\n' +
      ' (a) 신규 칸을 넣거나 뺐다 → 이 파일의 NEW_12 명단을 함께 고쳐라.\n' +
      ' (b) 고전 15종의 주석 머리가 `/* ── id … ── */` 양식으로 바뀌어 검사 대상에 끌려 들어왔다\n' +
      '     → 고전 15종은 동결 대상이라 17조를 통과시킬 수 없다. 주석 양식을 되돌려라.\n' +
      '현재 집힌 id: ' + [...new Set(seen)].join(', '),
    ).toBe(NEW_12.length);

    expect([...new Set(seen)].sort(), '명단이 어긋났다.').toEqual([...NEW_12].sort());
  });

  it.skipIf(!ready)('신규 12칸의 17조 위반이 0건이다 — 회귀 방지', () => {
    const { violations, stdout } = runChecker(combined());
    const detail = stdout.slice(stdout.indexOf('── 위반'));
    expect(
      violations,
      '신규 12칸이 「12칸 공통 규칙 v1」 17조를 어겼다.\n' +
      '이 12칸은 패널 7인이 5라운드에 걸쳐 위반 0 으로 맞춘 값이다. 한 토큰만 고쳐도 여기서 걸린다.\n' +
      '규칙을 느슨하게 해서 통과시키지 마라 — 그건 규칙을 지킨 게 아니라 시험을 고친 것이다\n' +
      '(결정 D-6 이 같은 이유로 nocturne 의 원안 복귀를 기각했다).\n' +
      '검사기 원문:\n' + detail,
    ).toBe(0);
  });

  it.skipIf(!ready)('★ 검사기 자체를 검사한다 — 일부러 어긴 값을 넣으면 잡아낸다', () => {
    // graphite 블록의 줄무늬(--og-row-alt-bg)를 행 배경과 같게 만든다 → 제7조후단 ΔL* 0 < 2.
    const css = combined();
    const start = css.indexOf('/* ── graphite ');
    expect(start, 'graphite 블록 머리를 못 찾았다 — 주석 양식이 바뀌었으면 이 뮤테이션도 고쳐라.').toBeGreaterThan(-1);
    const end = css.indexOf('/* ── ', start + 8);
    const block = css.slice(start, end === -1 ? undefined : end);
    const rowBg = block.match(/--og-row-bg:\s*(#[0-9a-fA-F]{3,8})\s*;/);
    expect(rowBg, 'graphite 의 --og-row-bg 를 못 읽었다.').not.toBeNull();
    const mutatedBlock = block.replace(/--og-row-alt-bg:\s*#[0-9a-fA-F]{3,8}\s*;/, '--og-row-alt-bg: ' + rowBg![1] + ';');
    expect(mutatedBlock, '뮤테이션이 적용되지 않았다 — 치환 대상을 못 찾았다.').not.toBe(block);

    const { violations } = runChecker(css.slice(0, start) + mutatedBlock + (end === -1 ? '' : css.slice(end)));
    expect(
      violations,
      '일부러 규칙을 어긴 값을 넣었는데 검사기가 0건이라고 답했다.\n' +
      '이 게이트는 눈이 멀었다 — 위의 「위반 0건」은 아무것도 증명하지 않는다.\n' +
      '_check17.mjs 의 파싱(주석 머리로 블록을 가르는 방식)이 깨졌는지 먼저 보라.',
    ).toBeGreaterThan(0);
  });
});

describe('정직 표기 — 고전 15종이 17조 대상이 아니라는 사실이 문서에 남아 있다', () => {
  it('이 사실을 적은 자리가 실재한다(문구가 지워지면 여기서 걸린다)', () => {
    const report = resolve(ROOT, 'sessions/theme-unanimous-2026-08/DEV_REPORT_D6D9.md');
    if (!existsSync(report)) return; // 보고서가 없는 저장소 사본에서는 판정하지 않는다
    const s = readFileSync(report, 'utf8');
    expect(
      /기존 15종.*6항목/s.test(s),
      'D-9 ③ 은 **"기존 15종은 6항목만 통과한 상태"라는 사실을 문서에 남길 것**을 요구한다.\n' +
      '게이트가 12칸만 재는데 문서가 그 사실을 안 적으면, 초록 게이트가 27종 전부를 보증하는 것처럼 읽힌다.',
    ).toBe(true);
  });
});
