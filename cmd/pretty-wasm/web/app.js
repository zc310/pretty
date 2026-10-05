/* pretty-wasm 网页示例：左侧粘贴 JSON，点按钮后右侧输出格式化结果。 */
'use strict';

const SAMPLE = `{"id":7,"name":"John","email":"john@example.com","active":true,
"address":{"city":"New York","zip":"10021","geo":{"lat":40.741895,"lng":-73.989308}},
"phoneNumbers":[{"type":"home","number":"212 555-1234"},{"type":"office","number":"646 555-4567"}],
"nickname":null,"tags":["a","b"],"balance":1234.56}`;

const DOWNLOAD_NAME = 'formatted.json';
const LANG_KEY = 'pretty-lang';

const I18N = window.PRETTY_I18N;

const el = {
  status: document.getElementById('wasm-status'),
  lang: document.getElementById('btn-lang'),
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
  inputMeta: document.getElementById('input-meta'),
  outputMeta: document.getElementById('output-meta'),
  splitter: document.getElementById('splitter'),
  statusbar: document.getElementById('status'),
};

let wasmAPI = null;
let lang = detectLang();
let wasmBadge = 'loading';
let status = null;

function detectLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && I18N[saved]) return saved;
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
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
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }

  el.lang.textContent = I18N[lang === 'zh' ? 'en' : 'zh'].langName;
  el.lang.title = t('lang.switch');

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
    el.output.classList.contains('error') || el.output.value === ''
      ? ''
      : formatBytes(byteLength(el.output.value));
}

function refreshButtons() {
  const ready = wasmAPI !== null;
  const hasInput = el.input.value.trim() !== '';
  const hasOutput = !el.output.classList.contains('error') && el.output.value !== '';
  el.format.disabled = !ready || !hasInput;
  el.ugly.disabled = !ready || !hasInput;
  el.clear.disabled = !hasInput && el.output.value === '';
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
    el.output.classList.add('error');
    el.output.value = errorText(error);
    setStatus('status.callFailed', { message: errorText(error) }, 'error');
    updateMetas();
    refreshButtons();
    return;
  }
  const elapsed = performance.now() - started;

  if (result && result.ok) {
    el.output.classList.remove('error');
    el.output.value = result.output;
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
    el.output.classList.add('error');
    el.output.value = message;
    setStatus('status.error', { message, ms: elapsed.toFixed(1) }, 'error');
  }
  updateMetas();
  refreshButtons();
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(el.output.value);
    setStatus('status.copied', null, 'ok');
  } catch (_) {
    // 非安全上下文（例如用 IP 直接访问）里 Clipboard API 不可用，退回选中复制。
    el.output.focus();
    el.output.select();
    const ok = document.execCommand('copy');
    setStatus(ok ? 'status.copied' : 'status.copyFailed', null, ok ? 'ok' : 'error');
  }
}

function downloadOutput() {
  const blob = new Blob([el.output.value], { type: 'application/json;charset=utf-8' });
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
  el.output.value = '';
  el.output.classList.remove('error');
  setStatus('status.cleared', null, '');
  updateMetas();
  refreshButtons();
  el.input.focus();
}

function loadSample() {
  el.input.value = SAMPLE;
  el.output.value = '';
  el.output.classList.remove('error');
  updateMetas();
  if (wasmAPI) {
    run(false);
  } else {
    setStatus('status.loading', null, 'error');
  }
}

function toInput() {
  el.input.value = el.output.value;
  el.output.value = '';
  el.output.classList.remove('error');
  run(false);
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
