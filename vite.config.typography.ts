import { defineConfig } from 'vite';
import { resolve } from 'path';
import { transform } from 'esbuild';

/**
 * 타이포그래피 축(제5축) 플러그인 전용 빌드 — `open-grid/typography`.
 *
 * **왜 별도 config 인가.** 메인 `vite.config.ts` 의 lib.entry 에 4번째 엔트리로 얹으면 rollup 이
 * 엔트리 도달 집합이 달라진 공유 모듈(`src/core/appearance/AppearanceAxis.ts`)을 코어 청크에서
 * 뽑아내 별도 공유청크로 만든다. 그러면 코어 청크는 335B 줄지만 코어 사용자가 748B 짜리 청크를
 * 하나 더 받게 되어 **순증 +413B**(gzip, ES 실측)다. 타이포를 쓰지 않는 사람의 번들을 늘리지
 * 않겠다는 것이 이 축의 전제 조건이므로(SPEC §0 D-2/D-3), 그래프를 아예 분리해 플러그인이
 * 자기 사본을 갖게 한다. 대가는 플러그인 쪽 ~0.7KB 중복이며, 그 비용은 타이포 사용자만 낸다.
 *
 * A dedicated build for the typography-axis plugin.
 *
 * Adding it as a 4th entry to the main config makes rollup hoist the shared
 * `AppearanceAxis.ts` out of the core chunk into a new shared chunk: the core chunk shrinks by
 * 335 B but core users must fetch an extra 748 B chunk — a net +413 B gzip for people who never
 * use typography. Splitting the graph keeps the core byte-identical; the plugin carries its own
 * ~0.7 KB copy, paid only by those who import it.
 *
 * 사용 / usage: vite build --config vite.config.typography.ts  (npm run build 가 이어서 호출)
 *
 * 타입 선언(`dist/types/typography/index.d.ts`)은 메인 빌드의 dts 플러그인이 이미 생성한다.
 * Type declarations are already emitted by the main build's dts plugin.
 */
export default defineConfig({
  plugins: [
    // 메인 config 와 동일: vite lib 모드가 ES 청크를 미니파이하지 않는 문제 우회.
    // Same as the main config: works around vite lib mode not minifying ES chunks.
    {
      name: 'og-minify-all-chunks',
      enforce: 'post' as const,
      async renderChunk(code: string) {
        const out = await transform(code, { minify: true, legalComments: 'none' });
        return { code: out.code, map: out.map || null };
      },
    },
  ],

  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },

  build: {
    // 메인 빌드 산출물을 지우지 않는다(같은 dist 에 이어 쓴다).
    emptyOutDir: false,
    lib: {
      entry: { 'open-grid-typography': resolve(__dirname, 'src/typography/index.ts') },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        format === 'es' ? `${entryName}.js` : `${entryName}.cjs`,
    },
    sourcemap: true,
    minify: false,
    cssMinify: false,
  }
});
