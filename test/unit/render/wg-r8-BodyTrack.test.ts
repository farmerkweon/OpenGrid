/**
 * 걸음 R8 본문 몫 — 칸이 아닌 본문 폭 자리를 GeometryApplier 에 「등록만」 한다(DOM 바이트 같음).
 * 테스트 설계서 §10-1 R8 줄: GD 같음 · U-GP 「등록 자리 px == 기하」(U-GP-12 의 R8 판 — 본문 범위) · 메모리(등록 수 = 붙은 자리 수).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { GeometryApplier } from '../../../src/core/render/GeometryApplier.js';
import { SCENES, installSceneEnv, disposeScene, tick, type Scene } from '../wg-helpers/scenes.js';
import { goldenSnapshot, unformatGolden } from '../wg-helpers/dom-snapshot.js';

const GOLDEN_DIR = path.resolve(__dirname, '../__golden__/wg');

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

const make = (id: string) => SCENES.find(s => s.id === id)!.make();
const applierOf = (s: Scene): GeometryApplier => (s.grid as any)._renderer._applier;
const body = (s: Scene) => s.container.querySelector<HTMLElement>('.og-body')!;

function bodyMismatches(a: GeometryApplier): string[] {
  const bad: string[] = [];
  for (const p of a.projections('body')) {
    const got = (p.el.style as any)[p.prop];
    if (got !== p.value) bad.push(`${p.el.className} ${p.prop}: ${got} ≠ ${p.value}`);
  }
  return bad;
}

/** 등록된 본문 요소 가운데 주어진 선택자에 맞는 것의 수. */
function trackedMatching(a: GeometryApplier, sel: string): number {
  return new Set(a.projections('body').map(p => p.el).filter(el => el.matches(sel))).size;
}

describe('R8 본문 — 등록 자리 px == 기하 값 (U-GP-12 R8 판, 본문 범위)', () => {
  for (const id of ['GD-01', 'GD-02', 'GD-03', 'GD-04', 'GD-05', 'GD-06', 'GD-07', 'GD-08', 'GD-10']) {
    it(`R8-BODY-01 ${id} 본문 등록 모두 지금 inline 값과 같음 · 사진은 골든 그대로`, async () => {
      const s = await make(id);
      try {
        const a = applierOf(s);
        expect(a, '그리드가 applier 를 본문에 넘겼다').toBeTruthy();
        expect(a.trackedCount('body')).toBeGreaterThan(0);
        expect(bodyMismatches(a)).toEqual([]);
        const golden = unformatGolden(fs.readFileSync(path.join(GOLDEN_DIR, `${id}.html`), 'utf8'));
        expect(goldenSnapshot(s.container) === golden).toBe(true);
      } finally { disposeScene(s); }
    });
  }
});

describe('R8 본문 — 무엇을 등록하나', () => {
  it('R8-BODY-02 본문 min-width = 전체 폭(trackTotal) 등록', async () => {
    const s = await make('GD-01');
    try {
      const a = applierOf(s);
      const p = a.projections('body').filter(x => x.el === body(s));
      expect(p.map(x => x.prop)).toEqual(['minWidth']);
      expect(p[0]!.value).toBe(body(s).style.minWidth);
    } finally { disposeScene(s); }
  });

  it('R8-BODY-03 가로 병합 칸(GD-04) = span 등록 width·min-width·max-width, 칸 하나', async () => {
    const s = await make('GD-04');
    try {
      const a = applierOf(s);
      const el = s.container.querySelector<HTMLElement>('.og-cell[aria-colspan="3"]')!;
      const p = a.projections('body').filter(x => x.el === el);
      expect(p.map(x => x.prop)).toEqual(['width', 'minWidth', 'maxWidth']);
      expect(p[0]!.value).toBe('360px');
      expect(trackedMatching(a, '.og-cell--merge-ph')).toBe(s.container.querySelectorAll('.og-cell--merge-ph').length);
    } finally { disposeScene(s); }
  });

  it('R8-BODY-04 세로 병합 마스터(GD-05) = left 등록 · 자리채움 폭 등록', async () => {
    const s = await make('GD-05');
    try {
      const a = applierOf(s);
      const el = s.container.querySelector<HTMLElement>('.og-cell[aria-rowspan="3"]')!;
      const p = a.projections('body').filter(x => x.el === el);
      expect(p.map(x => x.prop)).toEqual(['left']);
      expect(p[0]!.value).toBe(el.style.left);
    } finally { disposeScene(s); }
  });

  it('R8-BODY-05 묶음 행(GD-06) — 묶음 칸 전부 등록, 칸 지도의 자료 칸은 등록 안 함', async () => {
    const s = await make('GD-06');
    try {
      const a = applierOf(s);
      expect(trackedMatching(a, '.og-group-cell')).toBe(s.container.querySelectorAll('.og-group-cell').length);
      expect(trackedMatching(a, '.og-cell[role=gridcell]')).toBe(0);
    } finally { disposeScene(s); }
  });

  it('R8-BODY-06 디테일 패널(GD-08) width = 전체 폭 등록', async () => {
    const s = await make('GD-08');
    try {
      const a = applierOf(s);
      const panels = s.container.querySelectorAll('.og-detail-panel');
      expect(panels.length).toBeGreaterThan(0);
      expect(trackedMatching(a, '.og-detail-panel')).toBe(panels.length);
    } finally { disposeScene(s); }
  });

  it('R8-BODY-07 CF 데이터 막대(GD-10) 전부 등록(막대 폭 = 비율 × 칸 폭)', async () => {
    const s = await make('GD-10');
    try {
      const a = applierOf(s);
      const bars = s.container.querySelectorAll('.og-cf-bar');
      expect(bars.length).toBeGreaterThan(0);
      expect(trackedMatching(a, '.og-cf-bar')).toBe(bars.length);
    } finally { disposeScene(s); }
  });
});

describe('R8 본문 — 메모리: 다시 그려도 옛 등록이 남지 않음', () => {
  for (const id of ['GD-04', 'GD-06', 'GD-08', 'GD-10']) {
    it(`R8-BODY-08 ${id} 세 번 다시 그려도 본문 등록 수 그대로 · 등록 요소가 모두 DOM 에 붙어 있음`, async () => {
      const s = await make(id);
      try {
        const a = applierOf(s);
        // 장면이 마지막에 쓴 그리기 길과 _visRange 길은 행 범위가 다를 수 있어(지금 코드의 두 길) 같은 길로 한 번 그린 뒤 센다.
        (s.grid as any)._doRender(...(s.grid as any)._visRange()); await tick(1);
        const n0 = a.trackedCount('body');
        for (let k = 0; k < 3; k++) { (s.grid as any)._doRender(...(s.grid as any)._visRange()); await tick(1); }
        expect(a.trackedCount('body')).toBe(n0);
        expect(a.projections('body').every(p => p.el.isConnected)).toBe(true);
      } finally { disposeScene(s); }
    });
  }
});
