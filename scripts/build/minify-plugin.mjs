// 모든 빌드 설정(vite.config.ts·.typography·.header·.a11y·번들 측정 설정)이 함께 쓰는 압축 플러그인.
//
// 1) 모든 청크를 esbuild 로 압축하고 주석(JSDoc 포함)을 지운다.
//    vite lib 모드는 build.minify:false 여도 자기 vite:esbuild-transpile 단계(target 낮추기)를 renderChunk 에서 돌리며,
//    그 단계가 공백 압축 없이 다시 출력한다. 그래서 이 압축은 그 단계 **뒤에**(order:'post') 돌아야 공백까지 줄어든다.
//    target 은 vite 가 해석한 build.target 과 같게 둬서 압축이 문법 수준을 다시 올리지 않게 하고,
//    charset 은 vite 단계와 같은 utf8(한글 문자열을 \u 로 늘리지 않음), 소스맵은 이 단계의 맵을 사슬에 넘긴다.
// 2) 비공개 속성 이름 줄이기(기본 켬). TS 에서 private/protected 로 선언된 `_이름` 만, 빌드 때 src 에서 만든
//    고정 이름표(mangle-names.mjs)로 바꾼다. 모든 청크·모든 설정이 같은 표를 쓰므로 청크 사이(코어 ↔ 지연 청크 ↔
//    진입 ↔ 부가 번들)에서 같은 이름은 같은 짧은 이름이 된다. 남의 라이브러리만 든 청크(xlsx 등)는 바꾸지 않는다.
//    끄기: 환경 변수 OG_MANGLE=0 — 그러면 1) 만 하며 산출물은 이름 줄이기를 넣기 전과 바이트까지 같다.
//
// Shared minify plugin for every build config (main, typography, header, a11y, bundle measurement).
// 1) Minifies every chunk with esbuild and strips all comments. vite lib mode still runs its own
//    vite:esbuild-transpile step in renderChunk even with build.minify:false and re-prints whitespace, so this pass
//    runs **after** it (order:'post'). The target follows vite's resolved build.target, charset stays utf8, and the
//    source map is chained.
// 2) Private property renaming (on by default): only `_name` members declared private/protected in TS, using a
//    fixed table built from src at build time (mangle-names.mjs). Every chunk and every config uses the same table,
//    so a name maps to the same short name across chunks and add-on bundles. Chunks made only of third-party code
//    (xlsx etc.) are left alone. Turn it off with OG_MANGLE=0 — the output is then byte-identical to the build
//    before renaming existed.
import { transform } from 'esbuild';
import { resolve } from 'node:path';
import { buildMangleTable } from './mangle-names.mjs';

const esc = (s) => s.replace(/[$]/g, '\\$&');

/**
 * @param {{ srcDir: string, mangle?: boolean }} o  srcDir = 이름표를 만들 src 폴더 / src folder to build the table from
 */
export function ogMinifyAllChunks({ srcDir, mangle = process.env.OG_MANGLE !== '0' }) {
  const srcPrefix = resolve(srcDir).split('\\').join('/') + '/';
  let target;
  let sourcemap = false;
  let table = null;
  let mangleProps;
  let reserveProps;
  let logger;
  const seen = { mangled: [], skipped: [] };
  return {
    name: 'og-minify-all-chunks',
    enforce: 'post',
    configResolved(config) {
      target = config.build.target === false ? undefined : config.build.target;
      sourcemap = !!config.build.sourcemap;
      logger = config.logger;
      if (mangle) {
        table = buildMangleTable({ srcDir });
        mangleProps = new RegExp('^(?:' + table.mangle.map(esc).join('|') + ')$');
        reserveProps = new RegExp('^(?:' + Object.keys(table.reserved).map(esc).join('|') + ')$');
        config.logger.info(`[og-minify-all-chunks] private name mangling ON: ${table.mangle.length} renamed, ${Object.keys(table.reserved).length} reserved (OG_MANGLE=0 to turn off)`);
      }
    },
    renderChunk: {
      order: 'post',
      async handler(code, chunk) {
        const opts = { minify: true, legalComments: 'none', charset: 'utf8', target, sourcemap };
        if (table) {
          // 우리 모듈 = srcDir 안의 파일. 남의 코드 = node_modules. 그 밖(\0 가상 도우미 등)은 어느 쪽도 아님.
          // Ours = files under srcDir; third-party = node_modules; anything else (virtual helpers) is neutral.
          const ids = (chunk.moduleIds ?? Object.keys(chunk.modules ?? {})).map((id) => id.split('\\').join('/'));
          const third = ids.filter((id) => id.includes('/node_modules/'));
          const ours = ids.filter((id) => !id.includes('/node_modules/') && id.startsWith(srcPrefix));
          if (third.length && ours.length) {
            this.error(`og-minify-all-chunks: chunk ${chunk.fileName} mixes our modules with third-party code; private name mangling cannot be applied safely (set OG_MANGLE=0 or split the chunk).`);
          }
          (ours.length && !third.length ? seen.mangled : seen.skipped).push(chunk.fileName);
          if (ours.length && !third.length) {
            opts.mangleProps = mangleProps;
            opts.reserveProps = reserveProps;
            opts.mangleCache = { ...table.cache };
          }
        }
        const out = await transform(code, opts);
        if (opts.mangleCache && out.mangleCache) {
          for (const [k, v] of Object.entries(out.mangleCache)) {
            if (table.cache[k] !== v) this.error(`og-minify-all-chunks: ${chunk.fileName} renamed ${k} to ${v}, not the fixed table's ${table.cache[k]}`);
          }
        }
        return { code: out.code, map: sourcemap && out.map ? out.map : null };
      },
    },
    closeBundle() {
      if (table) logger.info(`[og-minify-all-chunks] renamed in: ${seen.mangled.join(', ') || '-'} | left alone: ${seen.skipped.join(', ') || '-'}`);
    },
  };
}
