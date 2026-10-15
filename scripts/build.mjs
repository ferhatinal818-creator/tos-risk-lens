// esbuild: uzantı (dist/extension) ve demo harness (dist/demo) paketleri.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'extension'), { recursive: true });
await mkdir(path.join(out, 'demo'), { recursive: true });

const common = { bundle: true, target: 'chrome120', logLevel: 'warning', sourcemap: false, legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'text' } };

await Promise.all([
  build({ ...common, entryPoints: [path.join(root, 'src/ext/background.js')], outfile: path.join(out, 'extension/background.js'), format: 'esm', platform: 'browser' }),
  build({ ...common, entryPoints: [path.join(root, 'src/ext/content.js')], outfile: path.join(out, 'extension/content.js'), format: 'iife', platform: 'browser' }),
  build({ ...common, entryPoints: [path.join(root, 'src/ext/options.js')], outfile: path.join(out, 'extension/options.js'), format: 'iife', platform: 'browser' }),
  build({ ...common, entryPoints: [path.join(root, 'demo/harness.js')], outfile: path.join(out, 'demo/harness.js'), format: 'iife', platform: 'browser' }),
]);
await cp(path.join(root, 'extension/manifest.json'), path.join(out, 'extension/manifest.json'));
await cp(path.join(root, 'extension/options.html'), path.join(out, 'extension/options.html'));
console.log('build tamam -> dist/extension, dist/demo');
