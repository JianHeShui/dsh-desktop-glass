/**
 * make-acrylic.mjs —— 从任意版本的 DSH 桌面版 app.asar 生成带窗口材质(毛玻璃)的版本
 *
 * 背景
 * ----
 * DSH 桌面版主窗口的 Windows 分支在 0.2.0 之后移除了 backgroundMaterial /
 * backgroundColor，主窗口因此变成不透明，Windows 的 Mica/Acrylic 材质透不出来。
 * 本脚本把这两个属性补回主窗口的 BrowserWindow 构造参数里。
 *
 * 硬约束：等字节原地修补
 * ----------------------
 * app.asar 内部是「头部 JSON + 各条目的原始字节」，头部记录每个条目的 offset / size /
 * integrity 哈希。若 main.js 变长，其后所有条目的 offset 都要重算，改动面极大。
 * 因此本脚本采用等字节修补：
 *   - 插入材质属性；同时从一段真实文档注释里裁掉等长字节来配平；
 *   - 条目大小不变 → 头部 offset 全部保持不变；
 *   - 只更新该条目自身的 integrity 哈希（hash 与 blocks[0]，单块时两者相同）。
 *
 * 安全性
 * ------
 * 任何一步不匹配（锚点不唯一、找不到可配平的注释、大小对不上、哈希结构与预期不符）
 * 都直接抛错退出，绝不写出半成品。调用方应再对输出的 main.js 做一次语法校验
 * （apply-acrylic.ps1 会自动做）。
 *
 * 用法
 * ----
 *   node make-acrylic.mjs <源 asar> <输出 asar> [输出 main.js 供语法校验] [--material=acrylic|mica]
 *
 * 材质说明
 * --------
 *   acrylic —— 最透，能明显看到桌面壁纸；但窗口失焦时会被 DWM 降级（变实），Windows 固有行为。
 *   mica    —— 较含蓄、更接近系统设置面板的观感，失焦降级不明显。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const MATERIALS = new Set(['acrylic', 'mica', 'tabbed', 'auto', 'none']);

const argv = process.argv.slice(2);
const materialArg = argv.find((a) => a.startsWith('--material='));
const MATERIAL = materialArg === undefined ? 'acrylic' : materialArg.slice('--material='.length);
const positional = argv.filter((a) => !a.startsWith('--'));

if (!MATERIALS.has(MATERIAL)) {
  console.error(`错误: 不支持的材质 "${MATERIAL}"，可选: ${[...MATERIALS].join(' / ')}`);
  process.exit(2);
}

const [src, out, outMain] = positional;
if (!src || !out) {
  console.error('用法: node make-acrylic.mjs <源 asar> <输出 asar> [输出 main.js 供语法校验] [--material=acrylic|mica]');
  process.exit(2);
}

// ---------- asar 解析 ----------
const buf = readFileSync(src);
const headerDataSize = buf.readUInt32LE(4);
const jsonSize = buf.readUInt32LE(12);
const headerJson = buf.subarray(16, 16 + jsonSize).toString('utf8');
const header = JSON.parse(headerJson);
const dataStart = 8 + headerDataSize;

function entryOf(rel) {
  const parts = rel.split('/');
  let map = header.files;
  let node;
  for (const p of parts) {
    node = map[p];
    if (node === undefined) throw new Error(`asar 缺少条目: ${rel}`);
    map = node.files;
  }
  return node;
}

const entry = entryOf('lib/main.js');
const mainStart = dataStart + Number(entry.offset);
const mainSize = entry.size;
const main = buf.subarray(mainStart, mainStart + mainSize).toString('utf8');
console.log(`源 asar : ${src} (${(buf.length / 1048576).toFixed(1)} MB)`);
console.log(`main.js : ${mainSize} 字节`);
console.log(`目标材质: ${MATERIAL}`);

// ---------- 1. 定位主窗口 win32 分支（必须唯一） ----------
// 兼容空白差异：捕获 `{` 与 `titleBarStyle` 之间的缩进
const anchorRe = /process\.platform === "win32" && primary \? \{(\s*)titleBarStyle: "hidden",/;
const allMatches = main.match(new RegExp(anchorRe.source, 'g')) ?? [];
if (allMatches.length !== 1) throw new Error(`主窗口锚点匹配 ${allMatches.length} 处，应为 1 处`);
const m = anchorRe.exec(main);
const innerIndent = m[1].replace(/^\n/, '');
if (innerIndent.length === 0) throw new Error('无法推断主窗口属性缩进');
const insertAfter = m.index + m[0].length;
console.log(`锚点唯一匹配 @${m.index}，属性缩进 ${innerIndent.length} 个制表符`);

// ---------- 2. 插入内容 ----------
const insertion =
  `\n${innerIndent}backgroundMaterial: "${MATERIAL}",` +
  `\n${innerIndent}backgroundColor: "#00000000",`;
const insertBytes = Buffer.byteLength(insertion, 'utf8');
console.log(`插入 ${insertBytes} 字节`);

// ---------- 3. 等字节配平：裁剪一段真实文档注释 ----------
// 只认「行首起始、独立成行、后面紧跟声明关键字」的 JSDoc，避免误伤字符串里的 /* */
function findBalanceTarget(text, need) {
  const re = /\n([ \t]*)(\/\*\*[\s\S]*?\*\/)(?=\n[ \t]*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\b)/g;
  const found = [];
  let hit;
  while ((hit = re.exec(text)) !== null) {
    const body = hit[2];
    if (body.length >= need + 24) found.push({ at: hit.index + 1 + hit[1].length, len: body.length });
  }
  found.sort((a, b) => a.len - b.len);
  return found[0] ?? null;
}

const target = findBalanceTarget(main, insertBytes);
if (target === null) throw new Error(`找不到可用于配平的文档注释（需要 >= ${insertBytes + 24} 字节）`);
const oldComment = main.slice(target.at, target.at + target.len);
if (!oldComment.startsWith('/**') || !oldComment.endsWith('*/')) throw new Error('配平目标不是完整块注释');
const newComment = `/**${oldComment.slice(3, oldComment.length - 2).slice(0, target.len - insertBytes - 5)}*/`;
if (Buffer.byteLength(newComment, 'utf8') !== target.len - insertBytes) throw new Error('配平长度计算不符');
console.log(`配平注释 @${target.at}: ${target.len} -> ${newComment.length} 字节`);

// ---------- 4. 施加修改（从后往前，避免位移影响） ----------
const edits = [
  { at: target.at, len: target.len, text: newComment },
  { at: insertAfter, len: 0, text: insertion },
].sort((a, b) => b.at - a.at);

let patched = main;
for (const e of edits) patched = patched.slice(0, e.at) + e.text + patched.slice(e.at + e.len);

const patchedBuf = Buffer.from(patched, 'utf8');
if (patchedBuf.length !== mainSize) throw new Error(`大小不匹配: ${patchedBuf.length} vs ${mainSize}`);
console.log(`✅ 等字节修补完成 (${mainSize} 字节)`);

// ---------- 5. 校验插入结果 ----------
const verifyRe = new RegExp(
  `process\\.platform === "win32" && primary \\? \\{\\s*titleBarStyle: "hidden",\\s*backgroundMaterial: "${MATERIAL}",\\s*backgroundColor: "#00000000",`,
);
if (!verifyRe.test(patched)) throw new Error('插入结果校验失败');
console.log('✅ 主窗口材质配置校验通过');

// ---------- 6. 更新头部 integrity ----------
const oldHash = entry.integrity?.hash;
if (typeof oldHash !== 'string') throw new Error('头部缺少 integrity.hash，asar 结构不受支持');
const srcHash = createHash('sha256').update(buf.subarray(mainStart, mainStart + mainSize)).digest('hex');
if (srcHash !== oldHash) throw new Error('源 main.js 的 sha256 与头部记录不符');
const newHash = createHash('sha256').update(patchedBuf).digest('hex');
if (oldHash === newHash) throw new Error('哈希未变化');
// 单块时 integrity.hash 与 blocks[0] 同为整文件 sha256（文件小于 blockSize）；
// 多块时 blocks[0] 只是首块哈希，不能这样替换 —— 因此显式校验出现次数。
const hashParts = headerJson.split(oldHash);
const hashCount = hashParts.length - 1;
if (hashCount !== 2) {
  throw new Error(`旧哈希在头部出现 ${hashCount} 次，预期 2 次（hash + blocks[0]），asar 结构不受支持`);
}
const newHeaderJson = hashParts.join(newHash);
if (newHeaderJson.length !== headerJson.length) throw new Error('header 长度变化');
console.log(`integrity: ${oldHash.slice(0, 12)}… -> ${newHash.slice(0, 12)}…`);

// ---------- 7. 写出 ----------
const outBuf = Buffer.from(buf);
patchedBuf.copy(outBuf, mainStart);
Buffer.from(newHeaderJson, 'utf8').copy(outBuf, 16);
writeFileSync(out, outBuf);
if (outMain !== undefined) writeFileSync(outMain, patchedBuf);
console.log(`✅ 已写出 ${out} (${(outBuf.length / 1048576).toFixed(1)} MB)`);
