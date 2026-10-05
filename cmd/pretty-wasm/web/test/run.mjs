/* 浏览器示例的静态检查：i18n 语言包完整性和 DOM 接线。不需要浏览器或 npm 依赖。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(webDir, 'app.js'), 'utf8');
const i18nSource = fs.readFileSync(path.join(webDir, 'i18n.js'), 'utf8');

const problems = [];
const check = (name, ok, detail) => {
  if (ok) {
    console.log(`ok   ${name}`);
    return;
  }
  problems.push(`${name}${detail ? `\n     ${detail}` : ''}`);
};

const tables = new Function('window', `${i18nSource}\nreturn window.PRETTY_I18N;`)({});
const langs = Object.keys(tables);
const lookup = (table, key) => key.split('.').reduce((node, part) => (node == null ? node : node[part]), table);
const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

// 页面里用到的 key：data-i18n 系列属性，加上 app.js 里 t() / setStatus() 的字面量。
const used = new Set();
for (const match of html.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g)) used.add(match[1]);
for (const match of app.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(match[1]);
for (const match of app.matchAll(/setStatus\(\s*'([\w.]+)'/g)) used.add(match[1]);
for (const match of app.matchAll(/setStatus\(ok \? '([\w.]+)' : '([\w.]+)'/g)) {
  used.add(match[1]);
  used.add(match[2]);
}
// badge.* 由 setWasmStatus 用模板拼出，不出现在字面量里。
for (const key of ['badge.loading', 'badge.ready', 'badge.failed']) used.add(key);

for (const key of [...used].sort()) {
  const missing = langs.filter(lang => typeof lookup(tables[lang], key) !== 'string');
  check(`i18n key ${key} defined in all languages`, missing.length === 0, `missing in ${missing.join(', ')}`);
}

const collectKeys = (node, prefix = '', out = []) => {
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === 'object') collectKeys(value, key, out);
    else out.push(key);
  }
  return out;
};

for (const lang of langs) {
  for (const key of collectKeys(tables[lang])) {
    check(`i18n key ${key} is used by ${lang}`, used.has(key), 'no data-i18n attribute or t()/setStatus() call references it');
  }
  for (const key of collectKeys(tables[lang])) {
    const others = langs
      .filter(other => other !== lang)
      .map(other => lookup(tables[other], key))
      .filter(text => typeof text === 'string');
    const mine = lookup(tables[lang], key);
    check(
      `i18n placeholders match for ${key} (${lang})`,
      others.every(other => placeholders(other) === placeholders(mine)),
      `${placeholders(mine)} vs ${others.map(placeholders).join(' / ')}`,
    );
  }
}

// app.js 引用的每个 id 都必须在 HTML 里存在，反之亦然。
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
for (const match of app.matchAll(/getElementById\('([^']+)'\)/g)) {
  check(`element #${match[1]} exists in index.html`, ids.has(match[1]));
}
for (const id of ids) {
  check(`element #${id} is used by app.js`, new RegExp(`getElementById\\('${id}'\\)`).test(app));
}

// app.js 依赖这些全局对象，index.html 必须先引入 wasm_exec.js。
check('wasm_exec.js loads before app.js', /wasm_exec\.js[\s\S]*i18n\.js[\s\S]*app\.js/.test(html));

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nweb ok: ${used.size} i18n keys x ${langs.length} languages, ${ids.size} elements`);
