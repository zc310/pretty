# Pretty WASM

Pretty WASM 把 `github.com/zc310/pretty` 的 JSON 格式化能力编译成 WebAssembly，让网页脚本直接格式化 JSON，所有处理都在浏览器本地完成，不上传任何数据。

`web` 目录是一个可直接部署的示例页面：左侧粘贴 JSON，点一下按钮，右侧输出格式化结果。

## 快速开始

在仓库根目录执行：

```bash
make build-wasm
make serve
```

然后打开 <http://localhost:8080>。

浏览器不能用 `file://` 加载 WASM，必须通过 HTTP 访问。也可以自行起一个静态服务：

```bash
python3 -m http.server 8080 --directory cmd/pretty-wasm/web
```

## 网页示例

- 左右分栏，中间可拖动分隔条；窄屏自动改为上下排列。
- 按钮：格式化、压缩、复制、下载、清空、示例、回填（把输出放回左侧继续编辑）。
- 快捷键：`Ctrl`/`Cmd` + `Enter` 格式化，按住 `Alt` 改为压缩。
- 选项：缩进（2 空格 / 4 空格 / Tab）、展开深度（留空表示不限）、对象键排序。改动选项后会重新格式化。
- 界面支持中文和英文，标题栏按钮切换；首次打开按浏览器语言选择，选择结果记在 `localStorage`。
- 亮色和暗色主题，标题栏按钮切换；首次打开跟随系统的 `prefers-color-scheme`，手动选过一次之后以用户的选择为准。两套主题的正文对比度都达到 WCAG AA。
- WASM 加载完成后自动填入示例并格式化一次。

## JS API

加载 `wasm_exec.js` 和 `pretty.wasm` 后，页面会得到全局对象 `pretty`：

```js
const go = new Go();
const { instance } = await WebAssembly.instantiateStreaming(
  fetch('pretty.wasm'),
  go.importObject,
);
go.run(instance); // 不阻塞，会一直运行

const result = pretty.format('{"b":1,"a":{"c":2}}');
// { ok: true, output: '{\n  "b":1,\n  "a":{\n    "c":2\n  }\n}', error: '' }
```

`pretty.format(json, options)` 总是返回 `{ok, output, error}`，不会抛异常。解析失败时 `ok` 为 `false`，`output` 为空串，`error` 是库返回的错误文本。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `indent` | string | `"  "` | 缩进字符串，传空串按两空格处理 |
| `maxDepth` | number | `0` | 展开的最大深度，`0` 或留空表示展开所有层级 |
| `minDepth` | number | `0` | 最大嵌套深度不超过该值时整体输出成一行，`0` 表示不启用 |
| `sortKeys` | boolean | `false` | 对象键按字典序排序 |
| `ugly` | boolean | `false` | 输出紧凑 JSON，覆盖 `maxDepth`、`minDepth` |

选项类型不对时 `ok` 为 `false`，`error` 说明是哪个字段。

## 注意事项

- 错误文本来自 Go 库（英文），不随页面语言切换。
- `ugly: true` 走库里的 `MarshalTo` 快路径，不做键排序，`sortKeys` 在压缩模式下无效。
- 示例页在主线程调用 WASM。几百 KB 的 JSON 几乎没有感觉，几 MB 的输入会短暂占用主线程；需要更稳可以自己把 `wasm_exec.js`、`pretty.wasm` 和这段胶水代码搬进 Web Worker，用 `postMessage` 传字符串。
- js/wasm 构建不含 `goccy/go-json`：它只接受 JSON 文本（`string`、`[]byte`）或 `*fastjson.Value`，把 Go 值序列化的兜底分支在 wasm 下返回错误，这样二进制小很多。
- `pretty.wasm` 和 `wasm_exec.js` 是构建产物，已在 `.gitignore` 里，不要提交。

## 构建与打包

```bash
make build-wasm          # 生成 cmd/pretty-wasm/web/pretty.wasm 和 wasm_exec.js
make package-wasm-web    # 把 web 目录打成 /tmp/pretty-bin/pretty-wasm-web.zip
make test-wasm-web       # 检查语言包完整性和 DOM 接线，只需 node
```

改动 `web/i18n.js`、`web/index.html` 或 `web/app.js` 后运行 `make test-wasm-web`：它会检查两种语言里每个 key 都存在、`{占位符}` 一致、语言包里没有没人用的 key，以及 `app.js` 引用的每个元素 id 都在 HTML 里。

`wasm_exec.js` 每次都从当前 `GOROOT` 的 `lib/wasm` 拷贝，请保持它和编译用的 Go 版本一致。

`wasm-opt` 是可选的：装了（`binaryen` 提供的）就会用 `-Oz` 再压一遍，实测 2697294 字节压到 2542048 字节。没装、或者压缩失败，构建都会继续，只是产物是未优化版本，控制台会说明原因；压缩失败时会把 `wasm-opt` 自己的报错原样打出来，不会中断构建。

`WASM_OPT_FLAGS` 里必须显式打开 Go 生成的 wasm 用到的特性（bulk memory、nontrapping-float-to-int、sign-ext、mutable-globals），否则 `wasm-opt` 会在输入校验阶段报上百行 `requires bulk memory` 然后退出。装的是老版本、不认这些选项时，构建同样会降级而不是失败，所以 CI 里单独校验了一遍选项能被接受，并用产物体积区分"压过了"和"压不动"。

部署时把 `web` 目录整体上传到任意静态服务即可，注意给 `.wasm` 配 `application/wasm` 的 MIME 类型；`app.js` 在 MIME 不对时会自动退回 `WebAssembly.instantiate`，所以不影响使用。页面里所有资源都用相对路径，放在子目录下（例如 `https://example.com/tools/pretty/`）不需要改代码。

本仓库在 `main` 分支上的每次相关提交都会由 [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) 自动构建并发布到 <https://zc310.github.io/pretty/>。该工作流会依次跑 `make build-wasm`、`make test-wasm-web`、`go test ./...`，剔除 `test/` 后把 `web` 目录发布为站点根目录。想改成发布到子目录，只需改工作流里 `Stage site` 那步的目标路径。
