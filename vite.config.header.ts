import { defineConfig } from 'vite';
import { resolve } from 'path';
import { transform } from 'esbuild';

/**
 * 헤더 축(제6축) 플러그인 전용 빌드 — `open-grid/header`.
 *
 * **왜 별도 config 인가.** 타이포 축(`vite.config.typography.ts`)이 실측으로 남긴 이유가 그대로
 * 적용된다. 메인 `vite.config.ts` 의 lib.entry 에 엔트리를 하나 더 얹으면 rollup 이 엔트리 도달
 * 집합이 달라진 공유 모듈(`src/core/appearance/AppearanceAxis.ts`)을 코어 청크에서 뽑아내
 * 별도 공유청크로 만든다. 그러면 코어 청크는 줄지만 **코어 사용자가 청크를 하나 더 받게 되어
 * 순증**이다(타이포 때 실측 +413B gzip). 머리글 취향 기능 때문에 헤더를 안 쓰는 사람의 번들을
 * 늘리지 않겠다는 것이 이 축의 전제 조건이므로, 그래프를 아예 분리해 플러그인이 자기 사본을 갖게 한다.
 *
 * 헤더 축은 타이포보다 사본이 조금 더 크다 — `TokenAxis` 외에 `TypedRegistry`(등록 정책:
 * 내장 보호·출처·플러그인 수명)까지 끌고 오기 때문이다. **그 비용은 헤더 축을 import 한 사람만 낸다.**
 *
 * A dedicated build for the header-axis plugin.
 *
 * Same rationale as the typography config: adding it as another entry to the main config makes
 * rollup hoist the shared `AppearanceAxis.ts` out of the core chunk, so core users would fetch an
 * extra chunk — a net increase for people who never use the header axis. Splitting the graph keeps
 * the core byte-identical; the plugin carries its own copy, paid only by those who import it.
 *
 * 사용 / usage: vite build --config vite.config.header.ts  (npm run build 가 이어서 호출)
 *
 * 타입 선언(`dist/types/header/index.d.ts`)은 메인 빌드의 dts 플러그인이 이미 생성한다.
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
      entry: { 'open-grid-header': resolve(__dirname, 'src/header/index.ts') },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        format === 'es' ? `${entryName}.js` : `${entryName}.cjs`,
    },
    sourcemap: true,
    minify: false,
    cssMinify: false,
  }
});
