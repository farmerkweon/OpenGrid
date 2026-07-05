import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync } from 'fs';
import { transform } from 'esbuild';
import dts from 'vite-plugin-dts';
import vue from '@vitejs/plugin-vue';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    vue(),
    react(),
    dts({ include: ['src'], outDir: 'dist/types' }),
    // Vite lib 모드가 ES 포맷 청크에 minify 를 적용하지 않는 문제 우회 —
    // 모든 청크를 esbuild 로 직접 압축하고 주석(JSDoc 포함)을 제거한다.
    // Works around Vite lib mode not minifying ES-format chunks; minify every
    // chunk via esbuild and strip all comments (including JSDoc) from the bundle.
    {
      name: 'og-minify-all-chunks',
      enforce: 'post' as const,
      async renderChunk(code: string) {
        const out = await transform(code, { minify: true, legalComments: 'none' });
        return { code: out.code, map: out.map || null };
      },
    },
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
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        format === 'es' ? `${entryName}.js` : `${entryName}.cjs`,
    },
    rollupOptions: {
      external: ['vue', 'react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: { vue: 'Vue', react: 'React', 'react-dom': 'ReactDOM' },
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
