/* 页面文案。语言按 localStorage 选择，首次访问按浏览器语言判断，可在标题栏切换。 */
window.PRETTY_I18N = {
  zh: {
    label: '中文',
    title: 'Pretty JSON · WebAssembly',
    subtitle: 'Go + WebAssembly，格式化全部在本地浏览器完成',
    badge: {
      loading: '加载 WASM…',
      ready: 'WASM 已就绪',
      failed: 'WASM 加载失败',
    },
    lang: { switch: 'Switch to English' },

    btn: {
      format: '格式化',
      ugly: '压缩',
      copy: '复制',
      download: '下载',
      clear: '清空',
      sample: '示例',
      toInput: '回填',
    },
    tip: {
      format: '格式化（Ctrl/Cmd + Enter，按住 Alt 改为压缩）',
      ugly: '压缩为紧凑 JSON',
      copy: '复制输出到剪贴板',
      download: '下载输出为文件',
      clear: '清空两侧内容',
      sample: '填入示例 JSON 并格式化',
      toInput: '把输出放回左侧继续编辑',
    },

    label: {
      indent: '缩进',
      depth: '深度',
      sortKeys: '排序键',
    },
    opt: {
      spaces2: '2 空格',
      spaces4: '4 空格',
      tab: 'Tab',
    },
    placeholderDepth: '不限',

    pane: { input: '输入', output: '输出' },
    placeholder: {
      input: '在此粘贴 JSON，例如 {"name":"John","age":30}',
      output: '格式化结果会显示在这里',
    },

    shortcut: 'Ctrl/Cmd + Enter',
    footer: '按 {shortcut} 格式化，按住 Alt 改为压缩',

    status: {
      ok: '完成：{in} → {out}，耗时 {ms} ms',
      error: '出错：{message} · 耗时 {ms} ms',
      callFailed: 'WASM 调用失败：{message}',
      copied: '已复制到剪贴板',
      copyFailed: '复制失败，请手动选择输出内容',
      downloaded: '已下载 {file}',
      cleared: '已清空',
      loading: 'WASM 尚未加载完成',
      loadFailed:
        '{message}。浏览器不能用 file:// 加载 WASM，请在仓库根目录执行 make build-wasm 后用 HTTP 服务打开 web 目录。',
    },
  },

  en: {
    label: 'English',
    title: 'Pretty JSON · WebAssembly',
    subtitle: 'Go + WebAssembly, formatting runs entirely in your browser',
    badge: {
      loading: 'Loading WASM…',
      ready: 'WASM ready',
      failed: 'WASM failed to load',
    },
    lang: { switch: '切换到中文' },

    btn: {
      format: 'Format',
      ugly: 'Minify',
      copy: 'Copy',
      download: 'Download',
      clear: 'Clear',
      sample: 'Sample',
      toInput: 'Send back',
    },
    tip: {
      format: 'Format (Ctrl/Cmd + Enter, hold Alt to minify)',
      ugly: 'Minify into compact JSON',
      copy: 'Copy the output to the clipboard',
      download: 'Download the output as a file',
      clear: 'Clear both panes',
      sample: 'Fill in sample JSON and format it',
      toInput: 'Move the output back to the input pane',
    },

    label: {
      indent: 'Indent',
      depth: 'Depth',
      sortKeys: 'Sort keys',
    },
    opt: {
      spaces2: '2 spaces',
      spaces4: '4 spaces',
      tab: 'Tab',
    },
    placeholderDepth: 'unlimited',

    pane: { input: 'Input', output: 'Output' },
    placeholder: {
      input: 'Paste JSON here, e.g. {"name":"John","age":30}',
      output: 'Formatted JSON shows up here',
    },

    shortcut: 'Ctrl/Cmd + Enter',
    footer: 'Press {shortcut} to format, hold Alt to minify',

    status: {
      ok: 'Done: {in} → {out} in {ms} ms',
      error: 'Error: {message} · {ms} ms',
      callFailed: 'WASM call failed: {message}',
      copied: 'Copied to clipboard',
      copyFailed: 'Copy failed, select the output and copy manually',
      downloaded: 'Downloaded {file}',
      cleared: 'Cleared',
      loading: 'WASM is still loading',
      loadFailed:
        '{message}. Browsers cannot load WASM from file://; run make build-wasm in the repo root and serve this directory over HTTP.',
    },
  },
};
