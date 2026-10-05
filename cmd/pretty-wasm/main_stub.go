//go:build !js || !wasm

package main

// WebAssembly 命令没有主机模式行为。此存根用于让 go vet、go test 等主机侧命令
// 仍然能够识别该命令包。
func main() {}
