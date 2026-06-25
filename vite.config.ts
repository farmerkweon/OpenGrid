import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync } from 'fs';
import dts from 'vite-plugin-dts';
import vue from '@vitejs/plugin-vue';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    vue(),
    react(),
    dts({ include: ['src'], outDir: 'dist/types' }),
    {
      name: 'copy-themes-css',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'src/styles/themes.css'),
          resolve(__dirname, 'dist/open-grid-themes.css')
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
    minify: 'esbuild',
    cssMinify: false,
  }
});
