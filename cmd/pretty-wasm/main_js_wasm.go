//go:build js && wasm

package main

import (
	"fmt"
	"syscall/js"

	"github.com/zc310/pretty"
)

// depthUnlimited 表示"展开所有层级"。库里 MaxDepth==0 且 MinDepth==0 的含义是输出
// 紧凑 JSON，所以"不限深度"必须传一个足够大的 MaxDepth，而不是 0。
const depthUnlimited = 1 << 30

func main() {
	api := js.Global().Get("Object").New()
	api.Set("format", js.FuncOf(format))
	js.Global().Set("pretty", api)
	select {}
}

// format 是 pretty.format(json[, options]) 的实现。options 支持 indent、maxDepth、
// minDepth、sortKeys、ugly 五个字段，返回 {ok, output, error}。
func format(_ js.Value, args []js.Value) any {
	if len(args) == 0 {
		return failure("pretty.format requires a JSON string argument")
	}
	if args[0].Type() != js.TypeString {
		return failure("pretty.format requires a JSON string argument")
	}

	opts, err := parseOptions(args)
	if err != nil {
		return failure(err.Error())
	}

	out, formatErr := pretty.FormatOptionsE(args[0].String(), opts.pretty())
	if formatErr != nil {
		return failure(formatErr.Error())
	}
	return success(out)
}

// options 是页面的格式化选项。默认值是全量展开、两空格缩进、不排序。
type options struct {
	indent   string
	maxDepth int
	minDepth int
	sortKeys bool
	ugly     bool
}

func defaultOptions() options {
	return options{indent: "  ", maxDepth: depthUnlimited}
}

// pretty 把页面选项翻译成库选项。ugly 覆盖深度设置，输出紧凑 JSON。
func (o options) pretty() *pretty.Options {
	if o.ugly {
		return &pretty.Options{Indent: o.indent, MaxDepth: 0, MinDepth: 0, SortKeys: o.sortKeys}
	}
	return &pretty.Options{Indent: o.indent, MaxDepth: o.maxDepth, MinDepth: o.minDepth, SortKeys: o.sortKeys}
}

func parseOptions(args []js.Value) (options, error) {
	opts := defaultOptions()
	if len(args) < 2 || args[1].Type() != js.TypeObject {
		return opts, nil
	}
	obj := args[1]

	indent, err := optString(obj, "indent", opts.indent)
	if err != nil {
		return opts, err
	}
	opts.indent = indent

	maxDepth, err := optInt(obj, "maxDepth", opts.maxDepth)
	if err != nil {
		return opts, err
	}
	if maxDepth <= 0 {
		maxDepth = depthUnlimited
	}
	if maxDepth > depthUnlimited {
		maxDepth = depthUnlimited
	}
	opts.maxDepth = maxDepth

	minDepth, err := optInt(obj, "minDepth", 0)
	if err != nil {
		return opts, err
	}
	if minDepth < 0 {
		minDepth = 0
	}
	opts.minDepth = minDepth

	sortKeys, err := optBool(obj, "sortKeys", opts.sortKeys)
	if err != nil {
		return opts, err
	}
	opts.sortKeys = sortKeys

	ugly, err := optBool(obj, "ugly", opts.ugly)
	if err != nil {
		return opts, err
	}
	opts.ugly = ugly

	return opts, nil
}

func optString(obj js.Value, name, def string) (string, error) {
	switch v := obj.Get(name); v.Type() {
	case js.TypeString:
		return v.String(), nil
	case js.TypeUndefined, js.TypeNull:
		return def, nil
	default:
		return "", fmt.Errorf("option %q must be a string", name)
	}
}

func optBool(obj js.Value, name string, def bool) (bool, error) {
	switch v := obj.Get(name); v.Type() {
	case js.TypeBoolean:
		return v.Bool(), nil
	case js.TypeUndefined, js.TypeNull:
		return def, nil
	default:
		return false, fmt.Errorf("option %q must be a boolean", name)
	}
}

func optInt(obj js.Value, name string, def int) (int, error) {
	switch v := obj.Get(name); v.Type() {
	case js.TypeNumber:
		return v.Int(), nil
	case js.TypeString:
		// 空字符串表示"不限"，交给调用方按默认值处理。
		if v.String() == "" {
			return def, nil
		}
		return 0, fmt.Errorf("option %q must be a number", name)
	case js.TypeUndefined, js.TypeNull:
		return def, nil
	default:
		return def, fmt.Errorf("option %q must be a number", name)
	}
}

func success(out []byte) js.Value {
	result := js.Global().Get("Object").New()
	result.Set("ok", true)
	result.Set("output", string(out))
	result.Set("error", "")
	return result
}

func failure(msg string) js.Value {
	result := js.Global().Get("Object").New()
	result.Set("ok", false)
	result.Set("output", "")
	result.Set("error", msg)
	return result
}
