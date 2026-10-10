/**
 * uninstall-plugin.mjs —— 从 DSH 桌面版 profile 中移除本插件
 *
 * 做三件事（幂等）：
 *   1. 从 <profile>\package.json 的 dsh.profile.bundles 里移除条目；
 *   2. 删除该依赖声明；
 *   3. 删除 <profile>\node_modules\dsh-desktop-glass 目录。
 *
 * 用法:
 *   node scripts/uninstall-plugin.mjs [--profile <目录>] [--dry-run]
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PLUGIN_NAME = 'dsh-desktop-glass';

function parseArgs(argv) {
  const options = { profile: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') options.dryRun = true;
    else if (token === '--profile') options.profile = argv[++i];
    else throw new Error(`未知参数: ${token}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const profileDir = path.resolve(options.profile ?? path.join(dshHome, 'profiles', 'desktop'));
const packageJsonPath = path.join(profileDir, 'package.json');
const targetDir = path.join(profileDir, 'node_modules', PLUGIN_NAME);

if (!existsSync(packageJsonPath)) {
  console.error(`错误: ${packageJsonPath} 不存在，profile 目录可能不对（用 --profile 指定）`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const bundles = manifest.dsh?.profile?.bundles;
const hadBundle = Array.isArray(bundles) && bundles.includes(PLUGIN_NAME);
const hadDep = manifest.dependencies?.[PLUGIN_NAME] !== undefined;
const hadDir = existsSync(targetDir);

if (!hadBundle && !hadDep && !hadDir) {
  console.log('未发现该插件的安装记录，无需处理。');
  process.exit(0);
}

if (hadBundle) manifest.dsh.profile.bundles = bundles.filter((b) => b !== PLUGIN_NAME);
if (hadDep) delete manifest.dependencies[PLUGIN_NAME];

console.log(`profile  : ${profileDir}`);
console.log(`改动     : bundles ${hadBundle ? '移除' : '无'} / 依赖 ${hadDep ? '移除' : '无'} / 目录 ${hadDir ? '删除' : '无'}`);

if (options.dryRun) {
  console.log('--- dry-run：以下内容不会写入 ---');
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

await writeFile(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
if (hadDir) await rm(targetDir, { recursive: true, force: true });

console.log('✅ 插件已卸载。重启 DSH 桌面版后，页面样式即完全还原。');
