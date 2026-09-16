#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = join(root, 'dist');

const withModules = process.argv.includes('--with-modules');
const stageName = withModules ? 'sporttech-api-ext-full' : 'sporttech-api-ext-update';
const stageDir = join(distDir, stageName);
const zipName = `${stageName}.zip`;
const zipPath = join(distDir, zipName);

const ROOT_FILES = [
    'index.js',
    'sse-handler.js',
    'logRoutes.js',
    'package.json',
    'package-lock.json',
    'LICENSE',
];

const ROOT_DIRS = [
    'extensions',
    'model',
    'routes',
    'utils',
    'static',
];

function fail(message) {
    console.error(message);
    process.exit(1);
}

function resolveAgConfigSource() {
    const overrideDir = process.env.PACK_VMIX_CONFIG_DIR;
    if (overrideDir) {
        const configPath = resolve(root, overrideDir, 'config.json');
        if (!existsSync(configPath)) {
            fail(`PACK_VMIX_CONFIG_DIR is set but config.json not found: ${configPath}`);
        }
        return { path: configPath, label: configPath };
    }

    const localPath = join(root, 'extensions', 'vmixLivesportAGConfig.json');
    if (!existsSync(localPath)) {
        fail(`Default AG config not found: ${localPath}`);
    }
    return { path: localPath, label: localPath };
}

function copyTree(src, dest) {
    cpSync(src, dest, {
        recursive: true,
        filter: (srcPath) => {
            const base = srcPath.split(/[/\\]/).pop();
            return base !== '.DS_Store';
        },
    });
}

function run(cmd, args, opts = {}) {
    const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
    if (result.error) {
        fail(`Failed to run ${cmd}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        fail(`${cmd} exited with code ${result.status}`);
    }
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const file of ROOT_FILES) {
    const src = join(root, file);
    if (!existsSync(src)) {
        fail(`Required file missing: ${src}`);
    }
    copyFileSync(src, join(stageDir, file));
}

for (const dir of ROOT_DIRS) {
    const src = join(root, dir);
    if (!existsSync(src)) {
        fail(`Required directory missing: ${src}`);
    }
    copyTree(src, join(stageDir, dir));
}

const updateMdName = withModules ? 'UPDATE-FULL.md' : 'UPDATE.md';
const updateMd = join(root, 'packaging', updateMdName);
if (!existsSync(updateMd)) {
    fail(`Missing packaging/${updateMdName}: ${updateMd}`);
}
copyFileSync(updateMd, join(stageDir, 'UPDATE.md'));

const agConfig = resolveAgConfigSource();
const extensionsDir = join(stageDir, 'extensions');
copyFileSync(agConfig.path, join(extensionsDir, 'config.json'));
copyFileSync(agConfig.path, join(extensionsDir, 'vmixLivesportAGConfig.json'));

if (withModules) {
    console.log('Installing production dependencies into staging (npm ci --omit=dev)...');
    run('npm', ['ci', '--omit=dev'], { cwd: stageDir });
}

run('zip', ['-r', zipName, stageName, '-x', '*.DS_Store', '*/.DS_Store'], { cwd: distDir });

console.log(`Created: ${zipPath}`);
console.log(`AG config source: ${agConfig.label}`);
console.log(`Includes node_modules: ${withModules ? 'yes (production)' : 'no'}`);
