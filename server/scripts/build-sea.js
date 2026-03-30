import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(_dir, '..');
const seaDir = path.join(root, '..', 'dist', 'sea');
const srcDir = path.join(root, 'src');
const migrationsDir = path.join(srcDir, 'db', 'migrations');
const libDir = path.join(root, 'lib');
const nodeAddonPath = path.join(
  root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node',
);

const isWin = process.platform === 'win32';
const outputExe = path.join(root, '..', 'dist', isWin ? 'indexical-server.exe' : 'indexical-server');

function clean() {
  if (existsSync(seaDir)) rmSync(seaDir, { recursive: true });
  mkdirSync(seaDir, { recursive: true });
}

function collectMigrations() {
  return readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
}

function platformSpellfixName() {
  switch (process.platform) {
    case 'win32':
      if (process.arch === 'ia32') return 'spellfix1-i386.dll';
      if (process.arch === 'arm64') return 'spellfix1-arm64.dll';
      return 'spellfix1.dll';
    case 'darwin':
      return process.arch === 'arm64' ? 'spellfix1-int.dylib' : 'spellfix1.dylib';
    case 'linux':
      return process.arch === 'ia32' ? 'spellfix1-i386.so' : 'spellfix1.so';
    default:
      return 'spellfix1.so';
  }
}

async function bundleApp() {
  const bindingsPlugin = {
    name: 'native-addon-shim',
    setup(b) {
      b.onResolve({ filter: /^bindings$/ }, () => ({
        path: 'bindings',
        namespace: 'native-shim',
      }));
      b.onLoad({ filter: /.*/, namespace: 'native-shim' }, () => ({
        contents: `module.exports = function() { return global.__BETTER_SQLITE3_ADDON; };`,
        loader: 'js',
      }));
    },
  };

  await build({
    entryPoints: [path.join(srcDir, 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node25',
    format: 'cjs',
    outfile: path.join(seaDir, 'app.cjs'),
    sourcemap: false,
    minify: false,
    plugins: [bindingsPlugin],
    banner: {
      js: `var __importMetaUrl = require("node:url").pathToFileURL(__filename).href;`,
    },
    define: {
      'import.meta.url': '__importMetaUrl',
    },
    external: [],
    logLevel: 'info',
  });
}

function generatePreamble(migrations, spellfixLib) {
  const migrationLines = migrations
    .map((f) => `  extractAsset("migration/${f}", "migrations/${f}");`)
    .join('\n');

  return `'use strict';
var __sea_isSea = false;
try { __sea_isSea = require('node:sea').isSea(); } catch (_) {}

if (__sea_isSea) {
  (function() {
    var sea = require('node:sea');
    var fs = require('node:fs');
    var os = require('node:os');
    var path = require('node:path');

    var tmpBase = path.join(os.tmpdir(), 'indexical-sea-' + process.pid);
    fs.mkdirSync(tmpBase, { recursive: true });

    function extractAsset(key, relPath) {
      var dest = path.join(tmpBase, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, new Uint8Array(sea.getRawAsset(key)));
      return dest;
    }

    var addonPath = extractAsset('better_sqlite3.node', 'better_sqlite3.node');
    var addonModule = { exports: {} };
    process.dlopen(addonModule, addonPath);
    global.__BETTER_SQLITE3_ADDON = addonModule.exports;

${migrationLines}
    process.env['MIGRATIONS_DIR'] = path.join(tmpBase, 'migrations');

${spellfixLib ? `    var spellfixPath = extractAsset('${spellfixLib}', '${spellfixLib}');
    process.env['SPELLFIX1_DLL'] = spellfixPath.replace(/\\.[^.]+$/, '');` : '    // No spellfix library bundled for this platform'}

    process.on('exit', function() {
      try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
    });
  })();
}
// --- bundled app follows ---
`;
}

function buildSeaConfig(assets) {
  return {
    main: path.join(seaDir, 'entry.cjs'),
    output: outputExe,
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
    assets,
  };
}

async function main() {
  console.log('[sea] cleaning ../dist/sea/');
  clean();

  console.log('[sea] bundling application with esbuild...');
  await bundleApp();

  console.log('[sea] collecting assets...');
  const assets = {};

  if (!existsSync(nodeAddonPath)) {
    console.error(`[sea] ERROR: native addon not found: ${nodeAddonPath}`);
    console.error('[sea] Run "npm install" first to build the native addon.');
    process.exit(1);
  }
  assets['better_sqlite3.node'] = nodeAddonPath;

  const migrations = collectMigrations();
  for (const m of migrations) {
    assets[`migration/${m}`] = path.join(migrationsDir, m);
  }
  console.log(`[sea]   ${migrations.length} migration files`);

  const spellfixLib = platformSpellfixName();
  const spellfixSrc = path.join(libDir, spellfixLib);
  if (existsSync(spellfixSrc)) {
    assets[spellfixLib] = spellfixSrc;
    console.log(`[sea]   spellfix: ${spellfixLib}`);
  } else {
    console.log(`[sea]   spellfix: not found for platform (${spellfixLib}), skipping`);
  }

  console.log('[sea] generating combined entry point...');
  const preamble = generatePreamble(
    migrations,
    existsSync(spellfixSrc) ? spellfixLib : null,
  );
  const appCode = readFileSync(path.join(seaDir, 'app.cjs'), 'utf8');
  writeFileSync(path.join(seaDir, 'entry.cjs'), preamble + appCode);

  console.log('[sea] writing sea-config.json...');
  const seaConfig = buildSeaConfig(assets);
  const configPath = path.join(seaDir, 'sea-config.json');
  writeFileSync(configPath, JSON.stringify(seaConfig, null, 2));

  console.log(`[sea] building executable: ${outputExe}`);
  mkdirSync(path.dirname(outputExe), { recursive: true });
  execFileSync(process.execPath, ['--build-sea', configPath], {
    stdio: 'inherit',
    cwd: root,
  });

  const size = statSync(outputExe).size;
  const sizeMb = (size / 1024 / 1024).toFixed(1);
  console.log(`[sea] done: ${outputExe} (${sizeMb} MB)`);
}

main().catch((err) => {
  console.error('[sea] build failed:', err);
  process.exit(1);
});
