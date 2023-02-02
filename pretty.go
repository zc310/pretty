package pretty

import (
	"bytes"
	"fmt"
	"github.com/goccy/go-json"
	"github.com/valyala/bytebufferpool"
	"github.com/valyala/fastjson"
	"io"
	"strings"
)

type Options struct {
	Indent   string
	MaxDepth int
	MinDepth int
}

var DefaultOptions = &Options{Indent: "  ", MaxDepth: 1, MinDepth: 1}

func Format(o any) []byte {
	switch v := o.(type) {
	case *fastjson.Value:
		return formatValue(v, nil, 0)
	case []byte:
		return FormatOptions(v, nil)
	case string:
		return FormatOptions([]byte(v), nil)
	default:
		b := bytebufferpool.Get()
		defer bytebufferpool.Put(b)
		_ = json.NewEncoder(b).Encode(v)
		return FormatOptions(b.B, nil)
	}
}

var pp fastjson.ParserPool

func FormatOptions(json []byte, opts *Options) []byte {
	p := pp.Get()
	defer pp.Put(p)
	o, err := p.ParseBytes(json)
	if err != nil {
		return []byte(fmt.Sprintf("%s : %s", err.Error(), string(json)))
	}
	return formatValue(o, opts, 0)
}
func formatValue(o *fastjson.Value, opts *Options, depth int) []byte {
	if opts == nil {
		opts = DefaultOptions
	}
	if opts.Indent == "" {
		opts.Indent = "  "
	}
	b := new(bytes.Buffer)

	if opts.MaxDepth != 0 && (depth >= opts.MaxDepth) || (opts.MinDepth != 0 && (getDepth(o, 0)) <= opts.MinDepth) {
		b.Write(o.MarshalTo(nil))
		return b.Bytes()
	}

	switch o.Type() {
	case fastjson.TypeObject:
		o1, _ := o.Object()
		n := 0
		_, _ = b.WriteString("{\n")
		o1.Visit(func(key []byte, v *fastjson.Value) {
			if n > 0 {
				_, _ = b.WriteString(",\n")
			}
			appendIndent(b, opts, depth+1)
			_, _ = b.WriteString(fmt.Sprintf(`"%s":`, string(key)))
			_, _ = b.Write(formatValue(v, opts, depth+1))
			n++
		})

		b.WriteString("\n")
		appendIndent(b, opts, depth)
		b.WriteString("}")
	case fastjson.TypeArray:
		o1, _ := o.Array()
		n := 0
		_, _ = b.WriteString("[\n")
		for _, o0 := range o1 {
			if n > 0 {
				_, _ = b.WriteString(",\n")
			}
			appendIndent(b, opts, depth+1)
			_, _ = b.Write(formatValue(o0, opts, depth+1))
			n++
		}
		b.WriteString("\n")
		appendIndent(b, opts, depth)
		b.WriteString("]")
	default:
		b.Write(o.MarshalTo(nil))
	}
	return b.Bytes()
}
func appendIndent(w io.Writer, opts *Options, depth int) {
	if depth < 1 {
		return
	}
	_, _ = fmt.Fprint(w, strings.Repeat(opts.Indent, depth))
}
func big(a, b int) int {
	if a > b {
		return a
	}
	return b
}
func getDepth(o *fastjson.Value, depth int) int {
	switch o.Type() {
	case fastjson.TypeObject:
		o1, _ := o.Object()
		n := 0
		o1.Visit(func(key []byte, v *fastjson.Value) {
			n = big(n, getDepth(v, depth))
		})
		return n + depth + 1
	case fastjson.TypeArray:
		o1, _ := o.Array()
		n := 0
		for _, v := range o1 {
			n = big(n, getDepth(v, depth))
		}
		return n + depth + 1
	default:
		return depth
	}
}
