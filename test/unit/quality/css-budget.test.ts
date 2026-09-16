/**
 * CSS 바이트 예산 게이트 — **오늘 존재하지 않는 게이트를 메운다.**
 *
 * `scripts/check-bundle-size.mjs` 는 `OpenGrid-*.js` 와 `open-grid.js` **둘만** 잰다(그 파일 14행).
 * 그래서 CSS 는 얼마가 늘어도 `npm run size` 가 그린이다. 그런데 이번 작업의 증량은 **거의 전부 CSS** 다:
 * 테마 12칸(+11.5KB gzip)·헤더 축(+9.6KB gzip). 게이트 통과를 근거로 "예산 안"이라고 보고하면 거짓이 된다.
 *
 * 요든 §2.3 이 지적한 「게이트가 증량 0을 증명 못 한다」의 CSS 판(版)이며, 그 결함은 지금도 남아 있다.
 *
 * **왜 dist 가 아니라 src 를 재는가.** dist 는 빌드해야 생기고 CI 순서에 의존한다. CSS 는 빌드가
 * 사실상 복사(vite.config.ts `copy-themes-css`)라 src 바이트가 사용자 다운로드와 1:1 이다.
 * base.css 만 번들 파이프라인을 타므로 그쪽은 여유를 크게 잡았다.
 *
 * **예산의 성격**: 상한이 아니라 **알람**이다. 넘으면 그 자체가 반려 사유가 아니라
 * "숫자를 들고 가서 승인을 받아라"는 뜻이다. 승인되면 이 숫자를 고치고 사유를 적는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(__dirname, '../../..');

/**
 * gzip 바이트 예산. 2026-08-08 실측을 기준으로 잡았다.
 *  - `everyone` = true 인 파일은 **모든 사용자가 받는다**(`src/index.ts:21` 이 import). 여유를 짜게 준다.
 *  - false 는 옵트인 로드(dist 에 별도 파일로 복사됨).
 */
const CSS_BUDGET: ReadonlyArray<{ path: string; gzip: number; everyone: boolean; note: string }> = [
  { path: 'src/styles/base.css',       gzip: 15_500, everyone: true,
    note: '실측 14,127B(2026-08-08). C-1~C-3 토큰화분 여유 포함. 전원 배송이라 여유를 짜게 잡는다.' },
  { path: 'src/styles/themes.css',     gzip: 26_000, everyone: false,
    note: '실측 11,915B + 신규 12칸 11,515B = 23,430B 예상. 옵트인이나 **테마 하나만 써도 전량을 받는다.**' },
  { path: 'src/styles/skins.css',      gzip:  3_000, everyone: false, note: '실측 2,348B. 이번 작업 대상 아님.' },
  { path: 'src/styles/typography.css', gzip:  4_000, everyone: false, note: '실측 3,150B. 이번 작업 대상 아님.' },
  { path: 'src/styles/header.css',     gzip: 11_000, everyone: false,
    note: '신설 예정. 시안 header-new.css 실측 9,601B + 여유. 파일이 없으면 skip 된다.' },
];

describe('CSS 바이트 예산 (gzip) — 코어 JS 게이트가 안 재는 층', () => {
  for (const b of CSS_BUDGET) {
    const abs = resolve(ROOT, b.path);
    const exists = existsSync(abs);

    it.skipIf(!exists)(`${b.path} ≤ ${b.gzip}B  [${b.everyone ? '전원 배송' : '옵트인'}]`, () => {
      const size = gzipSync(readFileSync(abs)).length;
      expect(
        size,
        `${b.path} 이 예산을 넘었다: ${size}B / ${b.gzip}B (${((size / b.gzip) * 100).toFixed(0)}%).\n` +
        `근거: ${b.note}\n` +
        (b.everyone
          ? '⚠ 이 파일은 이 기능을 안 쓰는 사용자도 전부 받는다. 옵트인 파일로 뺄 수 없는지 먼저 검토하라.'
          : '옵트인이지만 이 파일을 로드하는 사용자는 전량을 받는다. 값이 커지면 분할을 검토하라.'),
      ).toBeLessThanOrEqual(b.gzip);
    });
  }

  it('예산표가 실물 스타일시트를 빠짐없이 덮는다 — 새 CSS 가 게이트 밖으로 새지 않게', () => {
    const listed = new Set(CSS_BUDGET.map((b) => b.path.split('/').pop()));
    // src/styles 아래 .css 전수. 새 파일을 추가하고 예산을 안 적으면 여기서 걸린다.
    const dir = resolve(ROOT, 'src/styles');
    const files = require('node:fs')
      .readdirSync(dir)
      .filter((f: string) => f.endsWith('.css'));
    const unlisted = files.filter((f: string) => !listed.has(f));
    expect(
      unlisted,
      '예산표에 없는 스타일시트가 있다. CSS_BUDGET 에 추가하고 실측 근거를 적어라.',
    ).toEqual([]);
  });
});
