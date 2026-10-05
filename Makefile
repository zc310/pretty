# Makefile
.PHONY: build install test test-wasm-web clean cross dist run-example serve build-wasm package-wasm-web print-wasm-opt-flags

BINARY_NAME=pretty
BUILD_DIR ?=/tmp/pretty-bin
CGO_ENABLED=0

PLATFORMS ?= linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64
BASE_FLAGS=-trimpath -ldflags "-s -w"

# WebAssembly 构建。wasm_exec.js 每次从当前 GOROOT 拷贝，pretty.wasm 在 make
# build-wasm 时生成，两者都在 .gitignore 里，不入库。
# wasm-opt 的 feature flags 必须显式打开 Go 生成的 wasm 用到的特性：bulk memory
# （memory.copy/memory.fill）、nontrapping-float-to-int（i64.trunc_sat_*）、
# sign-ext 和 mutable-globals。缺一个 wasm-opt 就会在输入校验阶段报上百行
# "[wasm-validator error ...] requires bulk memory" 然后退出非零。
# 这些 flag 只影响 wasm-opt 是否接受输入，不会改变浏览器需要的功能集。
WASM_OPT ?= wasm-opt
WASM_OPT_FLAGS ?= -Oz \
	--enable-bulk-memory --enable-bulk-memory-opt \
	--enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals
WASM_WEB_DIR=cmd/pretty-wasm/web
WASM_BINARY=$(WASM_WEB_DIR)/pretty.wasm
WASM_EXEC=$(WASM_WEB_DIR)/wasm_exec.js
# abspath 必须在 cd 进 web 目录前算好：BUILD_DIR 可能是绝对路径，直接拼 CURDIR
# 会得到 /仓库根//tmp/... 这种非法的输出路径。
WASM_PACKAGE=$(abspath $(BUILD_DIR)/pretty-wasm-web.zip)

build:
	CGO_ENABLED=$(CGO_ENABLED) go build $(BASE_FLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/pretty

install:
	go install ./cmd/pretty

test:
	go test -v ./...

# test-wasm-web 检查网页示例的语言包和 DOM 接线。改动 i18n.js、index.html 或
# app.js 后必须一并运行，只需要 node，不需要 npm 依赖。
test-wasm-web:
	@node $(WASM_WEB_DIR)/test/run.mjs

clean:
	rm -rf $(BUILD_DIR) $(WASM_BINARY) $(WASM_EXEC)

# 浏览器示例：make build-wasm 之后用 make serve 打开页面。
# 浏览器不能用 file:// 加载 WASM，必须通过 HTTP 访问。
build-wasm: $(WASM_BINARY) $(WASM_EXEC)

serve: build-wasm
	@echo "打开 http://localhost:8080/"
	@python3 -m http.server 8080 --directory $(WASM_WEB_DIR)

# 打印压缩选项，供 CI 校验 wasm-opt 版本认这些选项：Makefile 里定义一次，
# 避免 CI 再抄一份，两边不一致就查不出来。
print-wasm-opt-flags:
	@echo '$(WASM_OPT_FLAGS)'

# wasm-opt 是可选的，装了就压一遍体积，没装或者压不动都用未优化的产物继续，
# 不能让可选工具拖垮构建。降级信息走 stdout 且不带"警告/错误"字样：这是正常
# 路径，输出到 stderr 会被终端标红，看起来像构建失败。
$(WASM_BINARY): FORCE
	@mkdir -p $(dir $@)
	@tmp="$@.tmp"; opt="$@.opt"; log="$@.log"; \
	trap 'rm -f "$$tmp" "$$opt" "$$log"' EXIT; \
	CGO_ENABLED=0 GOOS=js GOARCH=wasm go build $(BASE_FLAGS) -o "$$tmp" ./cmd/pretty-wasm || exit 1; \
	optimized=0; \
	if command -v $(WASM_OPT) >/dev/null 2>&1; then \
		if $(WASM_OPT) $(WASM_OPT_FLAGS) "$$tmp" -o "$$opt" 2>"$$log" && [ -s "$$opt" ]; then \
			mv "$$opt" "$@"; optimized=1; \
		else \
			printf '==> %s 压缩失败，改用未优化的产物：\n' "$(WASM_OPT)"; \
			if [ -s "$$log" ]; then sed 's/^/    /' "$$log"; \
			else printf '    （退出码为 0 但没有产出文件）\n'; fi; \
		fi; \
	fi; \
	if [ $$optimized -eq 0 ]; then \
		if [ ! -e "$$log" ]; then printf '==> 未找到 %s，跳过体积压缩（安装 binaryen 可启用）\n' "$(WASM_OPT)"; fi; \
		mv "$$tmp" "$@"; \
	fi; \
	printf '==> %s: ' "$@"; du -h "$@" | cut -f1

$(WASM_EXEC): FORCE
	@mkdir -p $(dir $@)
	cp "$$(CGO_ENABLED=0 GOOS=js GOARCH=wasm go env GOROOT)/lib/wasm/wasm_exec.js" "$@"

# test/ 是本地检查脚本，页面上没有入口，和 Pages 部署一样剔掉。
package-wasm-web: build-wasm
	@mkdir -p $(BUILD_DIR)
	@rm -f $(WASM_PACKAGE)
	@cd $(WASM_WEB_DIR) && zip -q -r "$(WASM_PACKAGE)" . -x 'test/*'
	@echo "Web package created in $(WASM_PACKAGE)"

FORCE:

# Build for one or more platforms, e.g.:
#   make cross                        # all PLATFORMS
#   make cross PLATFORMS="linux/amd64 windows/amd64"
cross:
	@mkdir -p $(BUILD_DIR)
	@set -e; \
	for p in $(PLATFORMS); do \
		os=$${p%/*}; arch=$${p#*/}; \
		ext=""; \
		if [ "$$os" = "windows" ]; then ext=".exe"; fi; \
		out="$(BUILD_DIR)/$(BINARY_NAME)-$${os}-$${arch}$${ext}"; \
		echo "==> Building $$p -> $$out"; \
		CGO_ENABLED=$(CGO_ENABLED) GOOS=$$os GOARCH=$$arch go build $(BASE_FLAGS) -o $$out ./cmd/pretty; \
	done
	@echo "Cross-compiled binaries in $(BUILD_DIR)/"

# Build cross-platform binaries and pack each into a .tar.gz archive
dist: cross
	@set -e; \
	cd $(BUILD_DIR) && for f in $(BINARY_NAME)-*; do \
		[ -e "$$f" ] || continue; \
		[ -z "$${f##*.tar.gz}" ] && continue; \
		tar -czf "$$f.tar.gz" "$$f" && rm -f "$$f"; \
	done
	@echo "Tarballs created in $(BUILD_DIR)/"

run-example:
	@echo '{"name":"John","age":30,"address":{"city":"NYC","zip":10001}}' | go run ./cmd/pretty -indent "  "
