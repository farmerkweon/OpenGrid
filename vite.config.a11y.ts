import { defineConfig } from 'vite';
import { resolve } from 'path';
import { transform } from 'esbuild';

/**
 * 접근성 도구 전용 빌드 — `open-grid/a11y`.
 *
 * 헤더 축(`vite.config.header.ts`)과 같은 이유로 그래프를 따로 둔다. 이 도구들(단축키 표·낭독 공지
 * 관리·그림 셀 말 바꾸기)은 그리드와 따로 쓰는 것이라 코어가 쓰지 않는다. 메인 진입점에 두면
 * 트리셰이킹이 없는 사용자(CDN·`<script type="module">` 로 `dist/open-grid.js` 를 바로 부르는 경우)가
 * 쓰지도 않는 약 1.6KB(gzip)를 받는다. 따로 두면 **import 한 사람만** 낸다.
 *
 * A dedicated build for the accessibility helpers (`open-grid/a11y`). Same rationale as the header
 * axis: the core never uses these helpers, so putting them in the main entry would make users without
 * tree-shaking (CDN / plain module script) download about 1.6KB gzip they never use. Split out, only
 * those who import them pay.
 *
 * 사용 / usage: vite build --config vite.config.a11y.ts  (npm run build 가 이어서 호출)
 *
 * 타입 선언(`dist/types/a11y/index.d.ts`)은 메인 빌드의 dts 플러그인이 이미 생성한다.
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
      entry: { 'open-grid-a11y': resolve(__dirname, 'src/a11y/index.ts') },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        format === 'es' ? `${entryName}.js` : `${entryName}.cjs`,
    },
    sourcemap: true,
    minify: false,
    cssMinify: false,
  }
});
