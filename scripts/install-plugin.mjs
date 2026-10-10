/**
 * install-plugin.mjs —— 把本包安装进 DSH 桌面版 profile
 *
 * 做三件事（幂等，可重复执行）：
 *   1. 把本仓库复制到 <profile>\node_modules\dsh-desktop-glass；
 *   2. 在 <profile>\package.json 里补上 dsh.profile.bundles 条目与依赖声明；
 *   3. 打印下一步提示。
 *
 * 用法:
 *   node scripts/install-plugin.mjs [--profile <目录>] [--link] [--dry-run]
 *
 *   --profile  指定 profile 目录，缺省为 $DSH_HOME/profiles/desktop（再缺省 ~/.dsh/profiles/desktop）
 *   --link     用 link: 代替 file: 依赖（符号链接，改仓库源码立即生效，便于调参）
 *   --dry-run  只打印将要写入的 package.json，不做任何修改
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_NAME = 'dsh-desktop-glass';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(HERE, '..');

// 不复制进 profile 的内容
const EXCLUDED = new Set(['.git', 'node_modules', 'backups', 'build']);

function parseArgs(argv) {
  const options = { profile: undefined, dryRun: false, link: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') options.dryRun = true;
    else if (token === '--link') options.link = true;
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
const spec = `${options.link ? 'link' : 'file'}:${SOURCE.replace(/\\/g, '/')}`;

if (!existsSync(path.join(SOURCE, 'cordis.patch.yml'))) {
  console.error(`错误: 仓库不完整，${SOURCE} 下找不到 cordis.patch.yml`);
  process.exit(1);
}
if (!existsSync(packageJsonPath)) {
  console.error(`错误: ${packageJsonPath} 不存在，profile 目录可能不对（用 --profile 指定）`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'));
manifest.dsh ??= {};
manifest.dsh.profile ??= {};
manifest.dsh.profile.bundles ??= [];
manifest.dependencies ??= {};

const bundled = manifest.dsh.profile.bundles.includes(PLUGIN_NAME);
const depended = manifest.dependencies[PLUGIN_NAME] !== undefined;

console.log(`profile    : ${profileDir}`);
console.log(`仓库源     : ${SOURCE}`);
console.log(`安装目标   : ${targetDir}`);
console.log(`依赖写法   : ${spec}`);
if (bundled && depended && existsSync(targetDir)) {
  console.log(`已有安装记录：${PLUGIN_NAME}（bundles 条目与依赖都在），本次仅重新同步源码。`);
}
if (!bundled) manifest.dsh.profile.bundles.push(PLUGIN_NAME);
if (!depended || manifest.dependencies[PLUGIN_NAME] !== spec) manifest.dependencies[PLUGIN_NAME] = spec;

if (options.dryRun) {
  console.log('--- dry-run：以下内容不会写入 ---');
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(SOURCE, targetDir, {
  recursive: true,
  filter: (srcPath) => !EXCLUDED.has(path.basename(srcPath)),
});
await writeFile(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log('✅ 插件已安装。');
console.log('');
console.log('下一步：重启 DSH 桌面版（宿主侧插件清单与浏览器 bundle 都在启动时组装）。');
console.log('注意：这一步只让「页面半透明」生效；要透出桌面壁纸还需要窗口材质补丁，');
console.log('      见 windows-acrylic\\apply-acrylic.ps1。');
