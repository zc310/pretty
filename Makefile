# Makefile
.PHONY: build install clean test cross dist run-example

BINARY_NAME=pretty
BUILD_DIR ?=/tmp/pretty-bin
CGO_ENABLED=0

PLATFORMS ?= linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64
BASE_FLAGS=-trimpath -ldflags "-s -w"

build:
	CGO_ENABLED=$(CGO_ENABLED) go build $(BASE_FLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/pretty

install:
	go install ./cmd/pretty

test:
	go test -v ./...

clean:
	rm -rf $(BUILD_DIR)

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
