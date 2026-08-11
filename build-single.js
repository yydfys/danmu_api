// danmu_api 单文件构建脚本：esbuild CJS 打包，兼容 server.js 顶层 await 和 import.meta
// 用法: node build-single.js [--outfile=dist/danmu_api.js]
import * as esbuild from 'esbuild';
import fs from 'fs';

const outfile = process.argv.includes('--outfile')
  ? process.argv[process.argv.indexOf('--outfile') + 1]
  : 'dist/danmu_api.js';

// Banner：CJS 环境下注入 __import_meta_url shim（模拟 import.meta.url）
const banner = `
const __import_meta_url = require('url').pathToFileURL(__filename).href;
`;

// 统一插件：import.meta.url 替换 + 顶层 await 转 async IIFE
const compatPlugin = {
  name: 'cjs-compat',
  setup(build) {
    build.onLoad({ filter: /\.(js|cjs)$/ }, async (args) => {
      if (args.path.includes('node_modules')) return;
      let contents = await fs.promises.readFile(args.path, 'utf8');
      let changed = false;
      if (contents.includes('import.meta.url')) {
        contents = contents.replace(/import\.meta\.url/g, '__import_meta_url');
        changed = true;
      }
      const isServer = /[\\/]danmu_api[\\/]server\.js$/.test(args.path);
      if (isServer && /^(\s*)await\s+/m.test(contents)) {
        contents = contents.replace(/^(\s*)await\s+([^;]+);\s*$/gm, '$1(async () => { await $2; })();');
        changed = true;
      }
      if (changed) {
        return { contents, loader: 'js' };
      }
      return undefined; // 未变更，让 esbuild 默认处理
    });
  },
};

try {
  await esbuild.build({
    entryPoints: ['danmu_api/server.js'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    banner: { js: banner },
    minify: false,
    sourcemap: false,
    logLevel: 'warning',
    plugins: [compatPlugin],
  });
  const size = (fs.statSync(outfile).size / 1024 / 1024).toFixed(2);
  console.log(`[build-single] OK: ${outfile} (${size} MB)`);
} catch (e) {
  console.error('[build-single] FAILED:', e.message);
  process.exit(1);
}
