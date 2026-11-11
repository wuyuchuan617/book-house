// 列出程式裡 tr('…') 用到、但 src/lib/i18n-en.ts 還沒有英文的字串
// 用法：node scripts/i18n-check.mjs [--keys]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
});
const unq = (s) => s.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
const used = new Map();
for (const f of walk(path.join(root, 'src')).filter((p) => !/i18n/.test(p))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)) {
    const k = unq(m[1]);
    if (!used.has(k)) used.set(k, path.relative(root, f));
  }
}
const en = fs.readFileSync(path.join(root, 'src/lib/i18n-en.ts'), 'utf8');
const have = new Set();
for (const m of en.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)) have.add(unq(m[1]));
const missing = [...used].filter(([k]) => !have.has(k));
const unused = [...have].filter((k) => !used.has(k));
if (process.argv.includes('--keys')) {
  for (const [k, f] of missing) console.log(`${f}\t${JSON.stringify(k)}`);
} else {
  console.log(`tr() 字串 ${used.size} 個；缺英文 ${missing.length} 個；用不到的翻譯 ${unused.length} 個`);
  for (const [k, f] of missing.slice(0, 50)) console.log(`  缺：${k}  (${f})`);
  for (const k of unused.slice(0, 20)) console.log(`  多餘：${k}`);
}
process.exit(missing.length ? 1 : 0);
