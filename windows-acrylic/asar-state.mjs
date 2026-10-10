/**
 * asar-state.mjs —— 检测 DSH 桌面版 app.asar 的窗口材质状态
 *
 * 输出一行 JSON，便于脚本解析：
 *   { patched, mainMaterial, welcomeMaterial, size }
 *
 *   patched         主窗口是否已带上 backgroundMaterial（即补丁是否已应用）
 *   mainMaterial    主窗口材质名；未设置则为 null
 *   welcomeMaterial 欢迎窗材质名；未设置则为 null
 *   size            app.asar 字节数
 *
 * 退出码：0 = 成功；1 = 读取/解析失败；2 = 用法错误
 *
 * 用法: node asar-state.mjs <asar 路径>
 */
import { readFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('用法: node asar-state.mjs <asar 路径>');
  process.exit(2);
}

try {
  const buf = readFileSync(src);
  const headerDataSize = buf.readUInt32LE(4);
  const jsonSize = buf.readUInt32LE(12);
  const header = JSON.parse(buf.subarray(16, 16 + jsonSize).toString('utf8'));
  const dataStart = 8 + headerDataSize;

  let map = header.files;
  let node;
  for (const p of 'lib/main.js'.split('/')) {
    node = map[p];
    if (node === undefined) throw new Error('asar 缺少 lib/main.js');
    map = node.files;
  }
  const main = buf
    .subarray(dataStart + Number(node.offset), dataStart + Number(node.offset) + node.size)
    .toString('utf8');

  // 主窗口分支：win32 + primary 的那一段
  const blockRe = /process\.platform === "win32" && primary \? \{([\s\S]{0,600}?)\n\t*\}/;
  const block = blockRe.exec(main)?.[1] ?? '';
  const mainMaterial = /backgroundMaterial:\s*"([a-z]+)"/.exec(block)?.[1] ?? null;

  // 全文里的材质名集合：主窗口之外的那个就是欢迎窗
  const all = [...main.matchAll(/backgroundMaterial:\s*"([a-z]+)"/g)].map((x) => x[1]);
  const welcomeMaterial = all.find((v) => v !== mainMaterial) ?? null;

  console.log(JSON.stringify({ patched: mainMaterial !== null, mainMaterial, welcomeMaterial, size: buf.length }));
  process.exit(0);
} catch (error) {
  console.error(`asar-state: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
