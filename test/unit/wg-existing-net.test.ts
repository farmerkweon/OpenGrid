// @vitest-environment node
/**
 * 넓은 그리드 T0 — 기존 그물 지문(EX-00~EX-04, TEST_DESIGN_NEW §8-3).
 *
 * 기준은 테스트 설계서 EX-00 표(검토 레인이 2026-11-21 04:09 에 sha256sum 으로 찍은 값)다. 이 파일은 지문을
 * 다시 찍지 않는다. 같은 값을 아래 EX00 상수에도 옮겨 적어, 설계서 표가 몰래 바뀌어도(문서 쪽 느슨해짐)
 * 파일이 바뀌어도(테스트 쪽 느슨해짐) 둘 다 빨개지게 한다.
 *
 * Wide-grid T0 — fingerprints of the existing safety net (EX-00..04). The reference is the EX-00
 * table in the test design; this file never re-fingerprints. The values are duplicated below so that
 * either the document or the files drifting turns the test red.
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEx00Table, sha256OfFile, git, readRepo, REPO, GOLDEN_DIR } from './wg-helpers/inventory';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

/** EX-00 표 원문(2026-11-21 04:09, L17 실측) — 손으로 옮긴 사본. 표와 같아야 한다(EX-00-표대조). */
const EX00: Record<string, string> = {
  'test/e2e/widegrid-fixture.html': '868de477e2b714f81f8215675c18997a68e4b55aaefee54a69bf268077c0c2c3',
  'test/e2e/widegrid-helpers.ts': 'aaa0464306487add2df5ce76903db6469628a4b345941a45371ef40ce1a70ed6',
  'test/e2e/widegrid-highlight.spec.ts': 'd6b869ddaea82914aa6a305b3e4c61b4c6955543203fabec04fadeae73858ef0',
  'test/e2e/widegrid-hscroll.spec.ts': 'b527a79d365d5c4ed7d2e345168a010f7d04c97570deb9810c6889f8ff319002',
  'test/e2e/widegrid-multiline.spec.ts': '420a85e40f4d644e934975d6d5160bc6105908a20ab342434488f87c1c3276ab',
  'test/e2e/widegrid-offscreen.spec.ts': '57c902695741f7b5ed3a5b90064439b217efbf3475c37f8ea6f256fe46a64384',
  'test/e2e/widegrid-resize.spec.ts': '8315c7f39e42d533c51ed8912dd33706578c971dc673ae2bfe6e4524e616a635',
  'test/unit/widegrid-helpers.ts': '0c0dc200d2e7eba31376332f9a0637b6ceef3ab2346556579c5ef8b24a347da5',
  'test/unit/widegrid-offscreen.characterization.test.ts': 'c03db3d58ad15d2238eee91496d53f101fa91a2725604d4c59b2ac8da8e3271c',
  'test/unit/widegrid-renderer.characterization.test.ts': '536af60ba6d0f5ca479d59d67ec5862a339ab8e617d5d43ac195f7375149d9f9',
  'test/unit/widegrid-resize.characterization.test.ts': 'dbcdc6fc3337201bee5ddcf8162cafecb26366a846fd2dfb65de3378459bb226',
  'test/unit/widegrid-sort.characterization.test.ts': '81034eafe80d8733c28463de0321e082b6d479ee2f8dd6c9e642d6ac98c31edf',
  'test/unit/appearance-resolver.test.ts': '5f8ead46c5a9210be96810db442138cade17a8cac5e935e54741dbb428043ff4',
  'test/unit/cf/openGrid-cf.test.ts': 'a1480968d68908c649941c3fb8a571e4c76b5816c8eed64fd0d476b064b17fb5',
};

/** §8-3: 「[이상해 보임]」 절차(§8-2)로만, TEST 레인만 고칠 수 있는 셋. 고치면 CHANGES.md 에 새 지문이 있어야 한다. */
const MUTABLE = [
  'test/e2e/widegrid-hscroll.spec.ts',
  'test/e2e/widegrid-offscreen.spec.ts',
  'test/unit/widegrid-renderer.characterization.test.ts',
];
const FU = ['test/unit/appearance-resolver.test.ts', 'test/unit/cf/openGrid-cf.test.ts'];
const L7_FROZEN = Object.keys(EX00).filter(f => !MUTABLE.includes(f) && !FU.includes(f));

function changesMdHashes(): Map<string, string[]> {
  const p = join(GOLDEN_DIR, 'CHANGES.md');
  const m = new Map<string, string[]>();
  if (!existsSync(p)) return m;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const f = /(test\/[\w/.-]+)/.exec(line);
    const h = /\b([0-9a-f]{64})\b/.exec(line);
    if (f && h) m.set(f[1]!, [...(m.get(f[1]!) ?? []), h[1]!]);
  }
  return m;
}

describe('EX-00 기준 지문 표', () => {
  it('EX-00 설계서 표를 읽으면 14줄이고 이 파일의 사본과 한 글자도 다르지 않다', () => {
    const rows = parseEx00Table();
    expect(rows.length).toBe(14);
    expect(Object.fromEntries(rows.map(r => [r.file, r.sha256]))).toEqual(EX00);
  });

  it('EX-00 대조군: 일부러 한 글자 바꾼 지문은 표와 다르다(비교가 살아 있음)', () => {
    const f = 'test/unit/appearance-resolver.test.ts';
    const flipped = EX00[f]!.replace(/^./, c => (c === '0' ? '1' : '0'));
    expect(sha256OfFile(f)).not.toBe(flipped);
  });

  it.each(L7_FROZEN)('EX-03 L7 특성 테스트 %s 의 sha256 = EX-00 값', (f) => {
    expect(sha256OfFile(f)).toBe(EX00[f]);
  });

  it.each(MUTABLE)('EX-03 고칠 수 있는 셋 %s 는 EX-00 값이거나, CHANGES.md 에 새 지문이 적혀 있다', (f) => {
    const now = sha256OfFile(f);
    if (now === EX00[f]) return;
    expect(changesMdHashes().get(f) ?? [], `${f} 가 EX-00 과 다른데 CHANGES.md 에 ${now} 가 없음`).toContain(now);
  });
});

describe('EX-01·EX-02 F-U 두 파일은 F 까지 지문 그대로(git diff 가 아니라 지문이 기준)', () => {
  it('EX-01 F-U1·F-U1b·F-U1c test/unit/appearance-resolver.test.ts sha256 = EX-00 값', () => {
    expect(sha256OfFile('test/unit/appearance-resolver.test.ts')).toBe(EX00['test/unit/appearance-resolver.test.ts']);
  });
  it('EX-02 F-U2 test/unit/cf/openGrid-cf.test.ts sha256 = EX-00 값', () => {
    expect(sha256OfFile('test/unit/cf/openGrid-cf.test.ts')).toBe(EX00['test/unit/cf/openGrid-cf.test.ts']);
  });
});

describe('EX-03 git 에 올라 있는 그 밖의 test/** 는 바뀌지 않았다', () => {
  it('EX-03 git diff -- test/ 에 걸리는 파일이 0개(wg-*·__golden__/wg/·고칠 수 있는 셋 제외)', () => {
    const changed = git('diff --name-only -- test/').trim().split('\n').filter(Boolean)
      .filter(f => !f.split('/').some(s => s.startsWith('wg-')))
      .filter(f => !f.startsWith('test/unit/__golden__/wg/'))
      .filter(f => !MUTABLE.includes(f));
    expect(changed).toEqual([]);
  });

  it('EX-03 지워진 추적 파일도 0개(git ls-files --deleted -- test/)', () => {
    expect(git('ls-files --deleted -- test/').trim()).toBe('');
  });

  it('EX-03 대조군: git 이 test/ 아래 추적 파일을 실제로 보고 있다(목록이 비면 검사가 죽은 것)', () => {
    const tracked = git('ls-files -- test/').trim().split('\n').filter(Boolean);
    expect(tracked.length).toBeGreaterThan(100);
    expect(tracked).toContain('test/unit/appearance-resolver.test.ts');
  });
});

describe('EX-04 F-U14 의존 — deps getColWidths 이름', () => {
  it.each([
    ['test/unit/OverrideStrategy.test.ts', 197],
    ['test/unit/OverrideStrategy.test.ts', 262],
    ['test/unit/export/sheets-excel-style.test.ts', 30],
  ] as const)('EX-04 %s:%i 가 deps 에 getColWidths 를 넘긴다(그 줄이 그대로 있음)', (file, line) => {
    const l = readRepo(file).split('\n')[line - 1] ?? '';
    expect(l).toMatch(/\bgetColWidths\s*:/);
  });

  it.each([
    'src/core/RenderController.ts',
    'src/core/FooterManager.ts',
    'src/core/ExportManager.ts',
  ])('EX-04 %s 의 deps 형에 getColWidths 이름이 있다', (file) => {
    expect(readFileSync(join(REPO, file), 'utf8')).toMatch(/\bgetColWidths\s*:\s*\(\)\s*=>/);
  });
});
