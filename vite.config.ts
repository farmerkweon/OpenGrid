import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, existsSync } from 'fs';
import { ogMinifyAllChunks } from './scripts/build/minify-plugin.mjs';
import dts from 'vite-plugin-dts';
import vue from '@vitejs/plugin-vue';
import react from '@vitejs/plugin-react';

// 압축·비공개 이름 줄이기 플러그인은 scripts/build/minify-plugin.mjs 한 곳에 있다(다섯 설정이 같이 씀 — 설명은 그 파일).
// 이름 줄이기를 끄려면 OG_MANGLE=0.
// The minify + private-name mangling plugin lives in scripts/build/minify-plugin.mjs (shared by all five configs;
// see the notes there). Set OG_MANGLE=0 to turn mangling off.

export default defineConfig({
  plugins: [
    vue(),
    react(),
    dts({ include: ['src'], outDir: 'dist/types' }),
    // Vite lib 모드가 청크를 압축하지 않는 문제 우회(ES·CJS 둘 다) — 위 ogMinifyAllChunks 설명 참조.
    // Works around vite lib mode not minifying chunks (ES and CJS); see ogMinifyAllChunks above.
    ogMinifyAllChunks({ srcDir: resolve(__dirname, 'src') }),
    {
      name: 'copy-themes-css',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'src/styles/themes.css'),
          resolve(__dirname, 'dist/open-grid-themes.css')
        );
        // R12b: 스킨(FORM 축) 스타일시트. themes.css 와 동형으로 별도 출력(옵트인 로드).
        copyFileSync(
          resolve(__dirname, 'src/styles/skins.css'),
          resolve(__dirname, 'dist/open-grid-skins.css')
        );
        // SPEC §2.7: 타이포그래피(제5축) 스타일시트. themes/skins 와 동형으로 별도 출력(옵트인 로드).
        // 아직 없으면(레인 A 미착지) 빌드를 죽이지 않되 조용히 넘어가지도 않는다 — 크게 알린다.
        const typoSrc = resolve(__dirname, 'src/styles/typography.css');
        if (existsSync(typoSrc)) {
          copyFileSync(typoSrc, resolve(__dirname, 'dist/open-grid-typography.css'));
        } else {
          console.warn(
            '[copy-themes-css] src/styles/typography.css 가 없어 dist/open-grid-typography.css 를 만들지 못했습니다. ' +
            '타이포 축의 요소 경로(data-og-typography)는 이 CSS 없이는 무동작입니다.'
          );
        }
        // 헤더(제6축) 스타일시트. 타이포와 동형으로 별도 출력(옵트인 로드).
        // ⚠ 헤더 축은 타이포보다 CSS 의존이 크다 — 프리셋이 거의 전부 속성 조건부 셀렉터라
        //    이 파일이 없으면 applyHeader() 를 불러도 화면이 사실상 안 바뀐다.
        const headerSrc = resolve(__dirname, 'src/styles/header.css');
        if (existsSync(headerSrc)) {
          copyFileSync(headerSrc, resolve(__dirname, 'dist/open-grid-header.css'));
        } else {
          console.warn(
            '[copy-themes-css] src/styles/header.css 가 없어 dist/open-grid-header.css 를 만들지 못했습니다. ' +
            '헤더 축의 프리셋(data-og-header)은 이 CSS 없이는 무동작입니다.'
          );
        }
      }
    }
  ],

  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },

  build: {
    lib: {
      entry: {
        'open-grid':      resolve(__dirname, 'src/index.ts'),
        'open-grid-vue':  resolve(__dirname, 'src/vue/index.ts'),
        'open-grid-react':resolve(__dirname, 'src/react/index.ts'),
        // ⚠ 타이포그래피(제5축) 플러그인 엔트리는 **여기에 넣지 않는다** — vite.config.typography.ts 참조.
        //   같은 rollup 그래프에 4번째 엔트리를 넣으면 공유 모듈(appearance/AppearanceAxis.ts)이
        //   코어 청크 밖으로 끌려 나와 별도 공유청크가 생기고, 코어 사용자가 청크 하나를 더 받는다
        //   (실측: 코어 청크 -335B 대신 새 청크 +748B = 순증 +413B). 그래서 그래프 자체를 분리했다.
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        format === 'es' ? `${entryName}.js` : `${entryName}.cjs`,
    },
    rollupOptions: {
      external: ['vue', 'react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: { vue: 'Vue', react: 'React', 'react-dom': 'ReactDOM' },
        // 남의 코드(fflate)는 우리 모듈과 한 덩어리로 섞지 않는다(비공개 이름 변환 안전선).
        // Keep third-party fflate in its own chunk (private-name mangling safety).
        manualChunks: (id) => (id.split('\\').join('/').includes('/node_modules/fflate/') ? 'fflate' : undefined),
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'open-grid-base.css';
          return '[name].[ext]';
        }
      }
    },
    sourcemap: true,
    // 압축은 og-minify-all-chunks 플러그인이 전담(ES/CJS 양 포맷 일관 압축).
    // Minification handled by the og-minify-all-chunks plugin for both formats.
    minify: false,
    cssMinify: false,
  }
});
