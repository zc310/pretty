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

// 同一个对象字面量里重复的 key，后一个会覆盖前一个，语言表里就只剩后一个，
// 上面那些按路径取值的检查全都发现不了。语言按钮最初就踩了这个坑：
// label 既是语言名又是选项标签组，重复定义后按钮显示成 [object Object]。
// 这里扫一遍源码，把同一层里出现两次以上的 key 指出来。
function duplicateKeys(source) {
  const found = [];
  // 逐 token 扫原文：注释和字符串整体跳过，避免字符串里的 '{"a":1}'、
  // 模板里的 {name} 和 URL 里的 // 被误当成 key 或大括号。
  // 维护大括号的进出栈，栈顶就是当前所在的对象：不能用全局深度计数，
  // 两个平级的对象（zh 和 en）深度相同但不是同一个。
  const stack = [{ keys: new Set() }];
  const token =
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|[A-Za-z_$][\w$]*|[{}]/g;
  let match;
  while ((match = token.exec(source)) !== null) {
    const text = match[0];
    if (text === '{') {
      stack.push({ keys: new Set() });
      continue;
    }
    if (text === '}') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (!/^[A-Za-z_$]/.test(text)) continue;
    // 标识符后面紧跟冒号才是 key，否则只是值（例如 bare 数组里的字符串）。
    const after = source.slice(token.lastIndex);
    const isKey = /^\s*:/.test(after);
    if (!isKey) continue;
    const level = stack[stack.length - 1];
    if (level.keys.has(text)) found.push(text);
    level.keys.add(text);
  }
  return found;
}

const duplicates = duplicateKeys(i18nSource);
check(
  'i18n.js has no duplicate keys in one object literal',
  duplicates.length === 0,
  `重复定义：${[...new Set(duplicates)].join(', ')}（后一个会覆盖前一个）`,
);

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
// langName 是语言按钮上显示的目标语言名，不走 t()，由 applyLang 直接取。
for (const key of ['langName']) used.add(key);
// applyTheme 用三元表达式在两个主题提示之间选，两边都要算用过。
for (const key of ['tip.themeLight', 'tip.themeDark']) used.add(key);

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

// —— 装成 app 和离线所需的文件 ——
const readIfPresent = name => {
  const file = path.join(webDir, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};
const exists = name => fs.existsSync(path.join(webDir, name));

const manifestSource = readIfPresent('manifest.webmanifest');
if (!manifestSource) {
  console.log('skip PWA checks: manifest.webmanifest not found');
} else {
  let manifest = null;
  try {
    manifest = JSON.parse(manifestSource);
    check('manifest.webmanifest is valid JSON', true);
  } catch (error) {
    check('manifest.webmanifest is valid JSON', false, error.message);
  }
  if (manifest) {
    // 浏览器判定"可安装"要 manifest 有 name/图标/start_url/display 四样，加上一条
    // 带 fetch 的 Service Worker。少一样就不会出现安装入口。
    check('manifest has name', typeof manifest.name === 'string' && manifest.name !== '');
    check('manifest has display', manifest.display === 'standalone', `got ${manifest.display}`);
    check('manifest has start_url', typeof manifest.start_url === 'string' && manifest.start_url !== '');
    const sizes = (manifest.icons || []).map(icon => icon.sizes);
    check('manifest has a 192px icon', sizes.includes('192x192'), `got ${sizes.join(', ')}`);
    check('manifest has a 512px icon', sizes.includes('512x512'), `got ${sizes.join(', ')}`);
    check(
      'manifest has a maskable icon',
      (manifest.icons || []).some(icon => (icon.purpose || '').split(/\s+/).includes('maskable')),
    );
    for (const icon of manifest.icons || []) {
      check(`manifest icon ${icon.src} exists`, exists(icon.src));
    }
    check('index.html links the manifest', /<link[^>]+rel="manifest"[^>]+href="manifest\.webmanifest"/.test(html));
    check('index.html links the apple-touch-icon', /rel="apple-touch-icon"/.test(html));
  }
}

const swSource = readIfPresent('service-worker.js');
if (!swSource) {
  console.log('skip service worker checks: service-worker.js not found');
} else {
  check('app.js registers the service worker', /serviceWorker\.register\(\s*'service-worker\.js'\)/.test(app));
  check('service worker has an install handler', /addEventListener\(\s*'install'/.test(swSource));
  check('service worker has an activate handler', /addEventListener\(\s*'activate'/.test(swSource));
  check('service worker has a fetch handler', /addEventListener\(\s*'fetch'/.test(swSource));

  // 预缓存列表必须覆盖装成 app 后真正会用到的文件，漏一个断网就少一块。
  const listMatch = swSource.match(/const PRECACHE = \[([\s\S]*?)\];/);
  check('service worker declares PRECACHE', listMatch !== null);
  if (listMatch) {
    const precache = [...listMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    const expected = [
      './', 'index.html', 'app.js', 'i18n.js', 'wasm_exec.js', 'pretty.wasm',
      'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png',
      'icon-maskable-512.png', 'apple-touch-icon.png',
    ].map(name => (name === './' ? name : `./${name}`));
    for (const name of expected) {
      check(`precache lists ${name}`, precache.includes(name), `got ${precache.join(', ')}`);
    }
    // 缓存名按内容重算。入库文件里是占位值，make build-wasm 才会改写它：
    //   - 仍是占位值、且构建产物也不在，说明本地还没构建，属正常；
    //   - 仍是占位值、但产物已经在了，说明构建跑了却没重算，部署出去用户会被旧缓存锁死。
    const cacheName = (swSource.match(/const CACHE_NAME = '([^']*)'/) || [])[1] || '';
    const built = exists('pretty.wasm');
    if (built) {
      check(
        'CACHE_NAME was recomputed by the build',
        /^pretty-shell_[0-9a-f]{16}$/.test(cacheName),
        `${cacheName}（构建产物已生成但缓存名没重算，部署后用户拿不到新版本）`,
      );
    } else {
      console.log(`skip CACHE_NAME check: ${cacheName}（还没跑 make build-wasm）`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nweb ok: ${used.size} i18n keys x ${langs.length} languages, ${ids.size} elements`);
