/**
 * 「기본값 불변」 기계 증명 — 축을 안 지정한 렌더가 오늘과 같은가.
 *
 * 지시서 `sessions/theme-unanimous-2026-08/SE_BRIEF_CORE.md` §2 ① / §5 의 요구를 자동화한 것이다.
 *
 * **증명의 원리 — 스크린샷이 아니라 대수(代數)로 푼다.**
 * 배선 결함 수정은 전부 `색값` → `var(--토큰, 색값)` 형태다. 축을 지정하지 않으면 `--토큰` 은
 * 정의되지 않고, CSS 규격상 `var()` 는 **폴백으로 계산된다.** 따라서
 *
 *     「축 미지정 렌더가 오늘과 같다」  ⇔  「var(--x, F) 를 F 로 치환한 CSS 가 오늘 CSS 와 같다」
 *
 * 이 동치를 쓰면 브라우저·폰트·OS 없이 **정적으로** 증명할 수 있다. 표본 검사가 아니라 전수 증명이다.
 * (내가 지난 트랙에 쓴 원칙: 스크린샷 골든은 만든 머신의 폰트에 종속되므로 시각 회귀는 도커 미러
 *  에서만 의미가 있다. 그러니 기계 증명은 시각이 아닌 층에서 해야 한다.)
 *
 * **전제 조건 2개를 함께 검사한다.** 어느 하나라도 깨지면 위 동치가 성립하지 않는다.
 *  (전제 A) 폴백에 쓴 값이 **오늘 값과 정확히 같아야** 한다 → 선언 멀티셋 비교로 검사.
 *  (전제 B) 그 토큰이 `:root`/`.og-container` 에 **기본값으로 선언돼 있으면 안 된다** — 선언돼 있으면
 *           폴백은 영영 안 쓰이고 값은 그 선언에서 온다(= 축 미지정인데도 값이 바뀐다).
 *
 * **의도된 변화는 화이트리스트에 이유와 함께 적는다.** 목록에 없는 변화는 전부 실패다(래칫).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(__dirname, '../../..');
const TARGETS = ['src/styles/base.css'] as const;

/** 비교 기준 커밋. CI/로컬에서 바꿀 수 있다. / Baseline ref; overridable. */
const BASELINE_REF = process.env.OG_BASELINE_REF ?? 'master';

/**
 * 의도된 기본값 변화 — **여기 없는 변화는 실패**다.
 * 한 줄씩 「선언 문자열 → 왜 바꾸기로 했는가」를 적는다. 승인 기록이 곧 테스트다.
 */
const INTENDED_DEFAULT_CHANGES: ReadonlyArray<{ decl: RegExp; why: string }> = [
  {
    decl: /^--og-row-accent-color:var\(--og-primary\)$/,
    why: 'A-1(결정 D-1): :root 에서 굳던 var() 를 .og-container 에서 재확정. 27종 hover 막대가 머티리얼 블루로 고정되던 결함.',
  },
  {
    decl: /^--og-spinner-color:var\(--og-primary\)$/,
    why: 'A-1(결정 D-1): 스피너 색이 테마를 안 따라오던 같은 결함.',
  },
  {
    decl: /^--og-row-accent-color:var\(--og-row-selected-color\)$/,
    why: 'A-1 안전판(모션 검토 문서 §3.1): 고전 10종에서 선택행 막대가 대비 1.00 으로 소실되는 것을 그 행 글자색으로 물러서서 막는다. A-1 과 반드시 짝.',
  },
  {
    decl: /^background-image:var\(--og-texture-bg\) !important$/,
    why: '제안 P10: 질감 축 토큰을 크롬에 칠하는 규칙. [data-og-texture] 가 붙은 그리드에만 걸리므로 축을 안 지정한 기본 화면은 그대로다.',
  },
  {
    decl: /^background-size:var\(--og-texture-size\) !important$/,
    why: '제안 P10: 위와 짝(결 반복 크기). 같은 선택자 안에만 있다.',
  },
];

/** 주석 제거 → var(--x, F) 를 F 로 치환(중첩 해소까지 반복). */
function normalize(css: string): string {
  const noComment = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let prev = noComment;
  for (let i = 0; i < 8; i++) {
    const next = prev.replace(/var\(\s*--[a-z0-9-]+\s*,\s*([^()]*?)\s*\)/gi, '$1');
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

/** 선언 멀티셋 — 규칙 순서·줄바꿈·들여쓰기에 영향받지 않는 비교 단위. */
function declarationCounts(css: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of normalize(css).matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/gi)) {
    const key = `${m[1].trim()}:${m[2].replace(/\s+/g, ' ').trim()}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function baselineOf(path: string): string | null {
  try {
    return execFileSync('git', ['show', `${BASELINE_REF}:${path}`], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null; // 얕은 클론·ref 부재 등 — 조용히 죽지 않고 skip 사유로 쓴다
  }
}

for (const target of TARGETS) {
  const base = baselineOf(target);
  const head = existsSync(resolve(ROOT, target)) ? readFileSync(resolve(ROOT, target), 'utf8') : null;

  describe(`기본값 불변 — ${target} (기준 ${BASELINE_REF})`, () => {
    it.skipIf(base === null || head === null)(
      '폴백 치환 후 선언 멀티셋이 기준과 같다 — 화이트리스트에 적은 의도된 변화만 예외',
      () => {
        const a = declarationCounts(base!);
        const b = declarationCounts(head!);
        const keys = new Set([...a.keys(), ...b.keys()]);

        const removed: string[] = [];
        const added: string[] = [];
        for (const k of keys) {
          const x = a.get(k) ?? 0;
          const y = b.get(k) ?? 0;
          if (y > x) added.push(k);
          if (x > y) removed.push(k);
        }

        const unexplained = added.filter(
          (k) => !INTENDED_DEFAULT_CHANGES.some((c) => c.decl.test(k)),
        );

        expect(
          removed,
          '기준에 있던 선언이 사라졌다 = 축을 안 지정해도 오늘과 다른 화면이 된다.\n' +
          '폴백 값을 오늘 값과 똑같이 적었는지 확인하라.',
        ).toEqual([]);

        expect(
          unexplained,
          '화이트리스트에 없는 기본값 변화다. 의도한 것이면 INTENDED_DEFAULT_CHANGES 에 "왜"와 함께 추가하라.\n' +
          '의도하지 않은 것이면 그것이 이 테스트가 잡으려던 회귀다.',
        ).toEqual([]);
      },
    );

    it.skipIf(head === null)(
      '(전제 B) 축 토큰은 base.css 에 기본값이 선언돼 있으면 안 된다 — 선언되면 폴백이 죽는다',
      () => {
        const css = head!.replace(/\/\*[\s\S]*?\*\//g, '');
        // 폴백과 함께 참조되는 축 토큰만 모은다(축이 값을 넣어주기를 기대하는 토큰).
        const referenced = new Set(
          [...css.matchAll(/var\(\s*(--og-(?:radius|skin|density|texture|typo|header-rule|header-band)[a-z0-9-]*)\s*,/gi)]
            .map((m) => m[1].toLowerCase()),
        );
        const declared = new Set(
          [...css.matchAll(/^\s*(--og-[a-z0-9-]+)\s*:/gim)].map((m) => m[1].toLowerCase()),
        );
        const shadowed = [...referenced].filter((t) => declared.has(t));
        expect(
          shadowed,
          'base.css 가 축 토큰의 기본값을 직접 선언했다. 그러면 var() 폴백은 절대 쓰이지 않고,\n' +
          '축을 안 지정해도 이 선언 값이 적용된다 = 기본값 불변 증명의 전제가 깨진다.',
        ).toEqual([]);
      },
    );
  });
}
