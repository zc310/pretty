# Makefile
.PHONY: build install clean test

BINARY_NAME=pretty
BUILD_DIR=bin

build:
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/pretty

install:
	go install ./cmd/pretty

test:
	go test -v ./...

clean:
	rm -rf $(BUILD_DIR)

run-example:
	@echo '{"name":"John","age":30,"address":{"city":"NYC","zip":10001}}' | go run ./cmd/pretty -indent "  "