// DD-14 §7 arch:check 게이트 배선(REQ-T8-879) — 적합성 함수를 실제 src 트리에 매 test 실행.
// "문서가 아니라 CI 게이트" (§4 Fitness Function): 코어 헤드리스·의존방향 위반을 실코드에서 강제.
// REQ-TX-841 좌표 슬라이스 소유권의 런타임 가드는 SliceOwnershipGuard(별 테스트)가 집행하고,
// 본 게이트는 의존방향·헤드리스 전역(TX-845/T6-804/§7.1)을 실트리에서 0 으로 못박는다.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { archCheck, formatViolations, type SourceFile } from '../../../src/core/host/archCheck.js';

const ROOT = resolve(__dirname, '../../..');

function collect(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
        const rel = p.slice(ROOT.length + 1).replace(/\\/g, '/');
        out.push({ path: rel, content: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(abs);
  return out;
}

describe('DD-14 arch:check gate over real src (REQ-TX-845/T6-804/T8-879)', () => {
  const files = collect('src/core');

  it('collects core source files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('src/core has ZERO architecture violations (headless + dependency direction)', () => {
    const violations = archCheck(files);
    // 위반이 있으면 리포트를 그대로 실패 메시지로 노출.
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
