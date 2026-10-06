/* pretty-wasm 网页示例：左侧粘贴 JSON，点按钮后右侧输出格式化结果。 */
'use strict';

const SAMPLE = `{"id":7,"name":"John","email":"john@example.com","active":true,
"address":{"city":"New York","zip":"10021","geo":{"lat":40.741895,"lng":-73.989308}},
"phoneNumbers":[{"type":"home","number":"212 555-1234"},{"type":"office","number":"646 555-4567"}],
"nickname":null,"tags":["a","b"],"balance":1234.56}`;

const DOWNLOAD_NAME = 'formatted.json';
const LANG_KEY = 'pretty-lang';
const THEME_KEY = 'pretty-theme';
// 超过这个字节数就不做语法高亮，只渲染纯文本。
const HIGHLIGHT_MAX_BYTES = 256 * 1024;

const I18N = window.PRETTY_I18N;

const el = {
  status: document.getElementById('wasm-status'),
  lang: document.getElementById('btn-lang'),
  theme: document.getElementById('btn-theme'),
  format: document.getElementById('btn-format'),
  ugly: document.getElementById('btn-ugly'),
  copy: document.getElementById('btn-copy'),
  download: document.getElementById('btn-download'),
  clear: document.getElementById('btn-clear'),
  sample: document.getElementById('btn-sample'),
  toInput: document.getElementById('btn-to-input'),
  indent: document.getElementById('indent'),
  maxDepth: document.getElementById('max-depth'),
  sortKeys: document.getElementById('sort-keys'),
  input: document.getElementById('input'),
  output: document.getElementById('output'),
  outputBody: document.getElementById('output-body'),
  outputGutter: document.getElementById('output-gutter'),
  inputMeta: document.getElementById('input-meta'),
  outputMeta: document.getElementById('output-meta'),
  splitter: document.getElementById('splitter'),
  statusbar: document.getElementById('status'),
};

// 输出面板不是 textarea，没有 value 可读，正文单独存一份作为唯一来源：
// 复制、下载、回填、算体积都从这里取，不从 DOM 反查。
const output = { text: '', isError: false };

// 渲染输出时记下的行元素和可折叠区间。lines[i] 的 code 和 number 分别是同��行的
// 代码和行号；folds[i] 是一段可折叠的行号区间。重新渲染时整体重建。
let lines = [];
let folds = [];

let wasmAPI = null;
let lang = detectLang();
let theme = detectTheme();
let wasmBadge = 'loading';
let status = null;

function detectLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && I18N[saved]) return saved;
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

// detectTheme 先看用户上次的选择，没有就跟随系统的 prefers-color-scheme。
// index.html 里 data-theme="light" 的样式只在亮色时生效，暗色是默认值，
// 所以这里只需要在亮色时设属性。
function detectTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function applyTheme() {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  el.theme.title = t(theme === 'light' ? 'tip.themeDark' : 'tip.themeLight');
  el.theme.setAttribute('aria-label', el.theme.title);
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
}

// t 取文案并替换 {name} 占位符。语言包里没有的键原样返回，方便排查漏翻。
function t(key) {
  const parts = key.split('.');
  let node = I18N[lang];
  for (const part of parts) {
    if (node === undefined || node === null) return key;
    node = node[part];
  }
  if (typeof node !== 'string') return key;

  const vars = arguments[1] || {};
  return node.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('title');

  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-title]')) {
    node.title = t(node.dataset.i18nTitle);
  }
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) {
    const text = t(node.dataset.i18nPlaceholder);
    node.placeholder = text;
    // 输出面板是 <pre>，没有 placeholder 属性，占位文案靠 CSS 的
    // attr(data-placeholder) 取，所以两种形式都要写。
    node.setAttribute('data-placeholder', text);
  }

  el.lang.textContent = I18N[lang === 'zh' ? 'en' : 'zh'].langName;
  el.lang.title = t('lang.switch');

  // 主题按钮的提示是译文，切换语言后要跟着重写。
  applyTheme();
  setWasmStatus(wasmBadge);
  renderStatus();
  updateMetas();
}

function toggleLang() {
  lang = lang === 'zh' ? 'en' : 'zh';
  localStorage.setItem(LANG_KEY, lang);
  applyLang();
}

function errorText(error) {
  if (!error) return '';
  return error.message || String(error);
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function setStatus(key, vars, kind) {
  status = { key, vars: vars || {}, kind: kind || '' };
  renderStatus();
}

function renderStatus() {
  if (!status) {
    el.statusbar.textContent = t('footer', { shortcut: t('shortcut') });
    el.statusbar.className = 'statusbar';
    return;
  }
  el.statusbar.textContent = t(status.key, status.vars);
  el.statusbar.className = `statusbar${status.kind ? ` ${status.kind}` : ''}`;
}

function setWasmStatus(kind) {
  wasmBadge = kind;
  el.status.textContent = t(`badge.${kind}`);
  el.status.className = `badge ${kind === 'loading' ? 'loading' : kind}`;
}

function updateMetas() {
  el.inputMeta.textContent = el.input.value === '' ? '' : formatBytes(byteLength(el.input.value));
  // 出错时右侧显示的是错误文本，不是 JSON，不标注体积。
  el.outputMeta.textContent =
    output.isError || output.text === '' ? '' : formatBytes(byteLength(output.text));
}

function refreshButtons() {
  const ready = wasmAPI !== null;
  const hasInput = el.input.value.trim() !== '';
  const hasOutput = !output.isError && output.text !== '';
  el.format.disabled = !ready || !hasInput;
  el.ugly.disabled = !ready || !hasInput;
  el.clear.disabled = !hasInput && output.text === '';
  el.copy.disabled = !hasOutput;
  el.download.disabled = !hasOutput;
  el.toInput.disabled = !hasOutput;
}

function currentOptions(ugly) {
  const indentChoice = el.indent.value;
  const depthText = el.maxDepth.value.trim();
  return {
    indent: indentChoice === 'tab' ? '\t' : ' '.repeat(Number(indentChoice)),
    // 深度留空或填 0 表示不限：WASM 侧会把 0 映射成"展开所有层级"。
    maxDepth: depthText === '' ? 0 : Number(depthText),
    minDepth: 0,
    sortKeys: el.sortKeys.checked,
    ugly,
  };
}

function run(ugly) {
  if (!wasmAPI) return;

  const started = performance.now();
  let result;
  try {
    result = wasmAPI.format(el.input.value, currentOptions(ugly));
  } catch (error) {
    setOutput(errorText(error), true);
    setStatus('status.callFailed', { message: errorText(error) }, 'error');
    return;
  }
  const elapsed = performance.now() - started;

  if (result && result.ok) {
    setOutput(result.output, false);
    setStatus(
      'status.ok',
      {
        in: formatBytes(byteLength(el.input.value)),
        out: formatBytes(byteLength(result.output)),
        ms: elapsed.toFixed(1),
      },
      'ok',
    );
  } else {
    const message = (result && result.error) || '';
    setOutput(message, true);
    setStatus('status.error', { message, ms: elapsed.toFixed(1) }, 'error');
  }
}

// setOutput 是写入输出面板的唯一入口：顺带做高亮、行号和折叠，调用方不用各自记得。
function setOutput(text, isError) {
  output.text = text;
  output.isError = isError;
  el.outputBody.classList.toggle('error', isError);
  el.outputBody.textContent = '';
  el.outputGutter.textContent = '';
  folds = [];

  if (isError || text === '') {
    // 错误文本不是 JSON，不高亮、不编号、不可折叠。
    el.outputBody.textContent = text;
  } else {
    renderJSON(text);
  }
  updateMetas();
  refreshButtons();
}

// renderJSON 按行渲染输出。折叠要按行隐藏内容，所以不能把所有 token 拍平成一个
// 片段——每行必须是独立元素，行号列才有对应的东西可以一起隐藏。
function renderJSON(text) {
  // 超过这个体积只渲染纯文本：实测每 KB 约 284 个 token，几百 KB 会有上万个
  // span 和上万个行元素，浏览器布局会明显卡住。格式化本身不受影响。
  if (byteLength(text) > HIGHLIGHT_MAX_BYTES) {
    el.outputBody.textContent = text;
    el.outputGutter.textContent = plainLineNumbers(text);
    lines = [];
    folds = [];
    return;
  }

  // 末尾换行会造出一行空行，行号和代码都对不上。
  const source = text.replace(/\n$/, '');
  const bodyFragment = document.createDocumentFragment();
  const gutterFragment = document.createDocumentFragment();
  // 先写进局部变量，收尾再赋给模块级的 lines/folds：折叠的点击处理要读它们，
  // 同名局部变量会把它遮住，表现成点了箭头没反应。
  const newLines = [];
  const newFolds = [];
  const stack = [];

  // newLine 开一行，行号列和代码列同时追加，两边始终等长。
  function newLine() {
    const number = document.createElement('div');
    number.className = 'line-no';
    number.textContent = String(newLines.length + 1);
    const line = document.createElement('div');
    line.className = 'line';
    newLines.push({ code: line, number });
    gutterFragment.appendChild(number);
    bodyFragment.appendChild(line);
    return line;
  }

  function appendText(chunk) {
    let rest = chunk;
    while (rest !== '') {
      const breakAt = rest.indexOf('\n');
      if (breakAt === -1) {
        current.appendChild(document.createTextNode(rest));
        return;
      }
      if (breakAt > 0) current.appendChild(document.createTextNode(rest.slice(0, breakAt)));
      current = newLine();
      rest = rest.slice(breakAt + 1);
    }
  }

  function appendToken(match) {
    // match[1] 是键的引号部分，match[2] 是它后面的空白加冒号。
    const [raw, key, keyTail, string, number, literal, punct] = match;
    const span = document.createElement('span');

    if (key !== undefined) {
      span.className = 'tok-key';
      // 冒号和键同色，视觉上更整齐。
      span.textContent = key + (keyTail || '');
      current.appendChild(span);
    } else if (string !== undefined) {
      span.className = 'tok-string';
      span.textContent = string;
      current.appendChild(span);
    } else if (number !== undefined) {
      span.className = 'tok-number';
      span.textContent = number;
      current.appendChild(span);
    } else if (literal !== undefined) {
      span.className = 'tok-literal';
      span.textContent = literal;
      current.appendChild(span);
    } else if (punct !== undefined) {
      span.className = 'tok-punct';
      span.textContent = punct;
      current.appendChild(span);
      if (punct === '{' || punct === '[') {
        stack.push({ open: newLines.length - 1, closer: punct === '{' ? '}' : ']' });
      } else if (punct === '}' || punct === ']') {
        const frame = stack.pop();
        // 只有真正跨了行才值得折叠：`{}` 折起来没有意义。
        if (frame && newLines.length - 1 > frame.open) {
          newLines[frame.open].number.classList.add('foldable');
          newFolds.push({
            start: frame.open,
            end: newLines.length - 1,
            // 折叠后要在行尾补上闭合括号，数组是 ] 不是 }。
            closer: frame.closer,
          });
        }
      }
    } else {
      current.appendChild(document.createTextNode(raw));
    }
  }

  // 输出一定是合法 JSON（格式化成功才走到这里），词法扫描不需要容错；
  // 用 textContent 逐段写入，不拼 HTML 字符串，粘贴进来的内容不会被当成标记解析。
  const pattern = /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([{}\[\],:])/g;
  let current = newLine();
  let last = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > last) appendText(source.slice(last, match.index));
    appendToken(match);
    last = match.index + match[0].length;
  }
  if (last < source.length) appendText(source.slice(last));

  el.outputBody.appendChild(bodyFragment);
  el.outputGutter.appendChild(gutterFragment);
  lines = newLines;
  folds = newFolds;
}

// plainLineNumbers 给超出高亮阈值的输出补行号：单个文本节点，几十万行也不会
// 因为每行一个元素而拖垮布局。
function plainLineNumbers(text) {
  // 末尾换行在 white-space: pre 的块里不占一行（CSS 会去掉块末尾的换行），
  // 行号却会多算一个，两列就对不齐了。renderJSON 里也用同样的规则去掉它。
  const count = 1 + (text.replace(/\n$/, '').match(/\n/g) || []).length;
  let out = '';
  for (let i = 1; i <= count; i += 1) out += `${i}\n`;
  // 末尾多出的换行会让行号列比代码多出一行高度。
  return out.slice(0, -1);
}

// toggleFold 折叠或展开一个区间。区间两端已经换行隐藏，所以代码列少掉的行数和
// 行号列一致；对齐不会破。
function toggleFold(index) {
  const fold = folds[index];
  if (!fold) return;
  const collapsed = !isCollapsed(fold);
  for (let line = fold.start + 1; line <= fold.end; line += 1) {
    lines[line].code.classList.toggle('hidden', collapsed);
    lines[line].number.classList.toggle('hidden', collapsed);
  }
  const opener = lines[fold.start];
  opener.number.classList.toggle('collapsed', collapsed);
  opener.code.classList.toggle('collapsed-tail', collapsed);
  opener.code.classList.toggle('collapsed-square', collapsed && fold.closer === ']');
}

function isCollapsed(fold) {
  return fold.end > fold.start && lines[fold.start + 1].code.classList.contains('hidden');
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(output.text);
    setStatus('status.copied', null, 'ok');
  } catch (_) {
    // 非安全上下文（例如用 IP 直接访问）里 Clipboard API 不可用，退回选中复制。
    // 输出面板现在是 div，没有 select()，临时塞一个 textarea 交给 execCommand。
    const scratch = document.createElement('textarea');
    scratch.value = output.text;
    scratch.setAttribute('readonly', '');
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(scratch);
    setStatus(ok ? 'status.copied' : 'status.copyFailed', null, ok ? 'ok' : 'error');
  }
}

function downloadOutput() {
  const blob = new Blob([output.text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DOWNLOAD_NAME;
  link.click();
  URL.revokeObjectURL(url);
  setStatus('status.downloaded', { file: DOWNLOAD_NAME }, 'ok');
}

function clearAll() {
  el.input.value = '';
  setOutput('', false);
  setStatus('status.cleared', null, '');
  el.input.focus();
}

function loadSample() {
  el.input.value = SAMPLE;
  if (wasmAPI) {
    run(false);
  } else {
    setOutput('', false);
    setStatus('status.loading', null, 'error');
  }
}

function toInput() {
  el.input.value = output.text;
  run(false);
}

// 行号列上的折叠箭头。事件委托给整列，避免每个箭头挂一个监听器。
function installFolding() {
  el.outputGutter.addEventListener('click', event => {
    const target = event.target.closest('.line-no.foldable');
    if (!target) return;
    const line = lines.findIndex(entry => entry.number === target);
    if (line === -1) return;
    const fold = folds.findIndex(entry => entry.start === line);
    if (fold !== -1) toggleFold(fold);
  });
}

function installSplitter() {
  let dragging = false;
  el.splitter.addEventListener('pointerdown', event => {
    dragging = true;
    el.splitter.classList.add('dragging');
    el.splitter.setPointerCapture(event.pointerId);
  });
  el.splitter.addEventListener('pointermove', event => {
    if (!dragging) return;
    const panes = el.splitter.parentElement.getBoundingClientRect();
    const ratio = (event.clientX - panes.left) / panes.width;
    const clamped = Math.min(0.8, Math.max(0.2, ratio));
    document.documentElement.style.setProperty('--left-width', `${(clamped * 100).toFixed(2)}%`);
  });
  const stop = () => {
    dragging = false;
    el.splitter.classList.remove('dragging');
  };
  el.splitter.addEventListener('pointerup', stop);
  el.splitter.addEventListener('pointercancel', stop);
}

// registerServiceWorker 让页面装成 app 后离线可用。注册失败不影响在线使用
// （file:// 下没有 navigator.serviceWorker，装到子目录时也可能被服务器挡掉），
// 所以只记日志，不往状态栏里报错。
function registerServiceWorker() {
  if (!navigator.serviceWorker) return;
  navigator.serviceWorker.register('service-worker.js').catch(error => {
    console.info('[pretty-wasm] Service Worker 未注册，离线不可用:', error);
  });
}

async function loadWasm() {
  if (typeof Go !== 'function') throw new Error('wasm_exec.js is missing');

  const go = new Go();
  const response = await fetch('pretty.wasm');
  if (!response.ok) throw new Error(`pretty.wasm: HTTP ${response.status}`);

  let result;
  try {
    result = await WebAssembly.instantiateStreaming(response.clone(), go.importObject);
  } catch (_) {
    result = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  }

  // go.run() 会一直阻塞在 select {} 上，不能 await。
  go.run(result.instance).catch(error => console.error('[pretty-wasm]', error));

  while (!globalThis.pretty) await new Promise(resolve => setTimeout(resolve, 0));
  wasmAPI = globalThis.pretty;
}

function main() {
  el.theme.addEventListener('click', toggleTheme);
  el.lang.addEventListener('click', toggleLang);
  el.format.addEventListener('click', () => run(false));
  el.ugly.addEventListener('click', () => run(true));
  el.copy.addEventListener('click', copyOutput);
  el.download.addEventListener('click', downloadOutput);
  el.clear.addEventListener('click', clearAll);
  el.sample.addEventListener('click', loadSample);
  el.toInput.addEventListener('click', toInput);
  el.input.addEventListener('input', () => {
    updateMetas();
    refreshButtons();
  });
  el.input.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      run(event.altKey);
    }
  });
  for (const option of [el.indent, el.maxDepth, el.sortKeys]) {
    option.addEventListener('change', () => {
      if (wasmAPI && el.input.value.trim() !== '') run(false);
    });
  }
  installSplitter();
  installFolding();
  registerServiceWorker();
  applyLang();
  refreshButtons();

  loadWasm()
    .then(() => {
      setWasmStatus('ready');
      loadSample();
    })
    .catch(error => {
      setWasmStatus('failed');
      setStatus('status.loadFailed', { message: errorText(error) }, 'error');
    });
}

main();
