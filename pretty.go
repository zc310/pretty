package pretty

import (
	"fmt"
	"io"
	"strings"

	"github.com/goccy/go-json"
	"github.com/valyala/bytebufferpool"
	"github.com/valyala/fastjson"
)

type Options struct {
	Indent   string
	MaxDepth int
	MinDepth int
}

var DefaultOptions = &Options{Indent: "  ", MaxDepth: 1, MinDepth: 1}

func Format(o any) []byte { return FormatOptions(o, nil) }
func Ugly(o any) []byte   { return FormatOptions(o, &Options{MaxDepth: 0, MinDepth: 0}) }
func FormatOptions(o any, opts *Options) []byte {
	switch v := o.(type) {
	case *fastjson.Value:
		return formatValue(v, opts, 0)
	case []byte:
		return formatByte(v, opts)
	case string:
		return formatByte([]byte(v), opts)
	default:
		b := bytebufferpool.Get()
		defer bytebufferpool.Put(b)
		if err := json.NewEncoder(b).Encode(v); err != nil {
			return []byte(fmt.Sprintf("encode error: %v", err))
		}
		return formatByte(b.B, opts)
	}
}

var pp fastjson.ParserPool

func formatByte(json []byte, opts *Options) []byte {
	p := pp.Get()
	defer pp.Put(p)

	v, err := p.ParseBytes(json)
	if err != nil {
		return []byte(fmt.Sprintf("parse error: %v\njson: %s", err, string(json)))
	}
	return formatValue(v, opts, 0)
}
func formatValue(o *fastjson.Value, opts *Options, depth int) []byte {
	if opts == nil {
		opts = DefaultOptions
	}
	if opts.Indent == "" {
		opts.Indent = "  "
	}
	if opts.MaxDepth == 0 && opts.MinDepth == 0 {
		return o.MarshalTo(nil)
	}

	if opts.MaxDepth != 0 && (depth >= opts.MaxDepth) || (opts.MinDepth != 0 && (getDepth(o, 0)) <= opts.MinDepth) {
		return o.MarshalTo(nil)
	}
	buf := bytebufferpool.Get()
	defer bytebufferpool.Put(buf)

	switch o.Type() {
	case fastjson.TypeObject:
		formatObject(o, buf, opts, depth)
	case fastjson.TypeArray:
		formatArray(o, buf, opts, depth)
	default:
		buf.Write(o.MarshalTo(nil))
	}

	result := make([]byte, buf.Len())
	copy(result, buf.Bytes())
	return result
}
func formatObject(v *fastjson.Value, buf *bytebufferpool.ByteBuffer, opts *Options, depth int) {
	obj, _ := v.Object()
	first := true

	buf.WriteString("{\n")
	obj.Visit(func(key []byte, val *fastjson.Value) {
		if !first {
			buf.WriteString(",\n")
		}
		appendIndent(buf, opts, depth+1)
		buf.WriteByte('"')
		buf.Write(key)
		buf.WriteString(`":`)
		buf.Write(formatValue(val, opts, depth+1))
		first = false
	})
	buf.WriteString("\n")
	appendIndent(buf, opts, depth)
	buf.WriteByte('}')
}

func formatArray(v *fastjson.Value, buf *bytebufferpool.ByteBuffer, opts *Options, depth int) {
	arr, _ := v.Array()
	first := true

	buf.WriteString("[\n")
	for _, item := range arr {
		if !first {
			buf.WriteString(",\n")
		}
		appendIndent(buf, opts, depth+1)
		buf.Write(formatValue(item, opts, depth+1))
		first = false
	}
	buf.WriteString("\n")
	appendIndent(buf, opts, depth)
	buf.WriteByte(']')
}
func appendIndent(w io.Writer, opts *Options, depth int) {
	if depth > 0 {
		io.WriteString(w, strings.Repeat(opts.Indent, depth))
	}
}
func getDepth(o *fastjson.Value, depth int) int {
	if o == nil {
		return depth
	}

	switch o.Type() {
	case fastjson.TypeObject:
		obj, _ := o.Object()
		maxDepth := 0
		obj.Visit(func(_ []byte, v *fastjson.Value) {
			if d := getDepth(v, depth); d > maxDepth {
				maxDepth = d
			}
		})
		return maxDepth + 1
	case fastjson.TypeArray:
		arr, _ := o.Array()
		maxDepth := 0
		for _, v := range arr {
			if d := getDepth(v, depth); d > maxDepth {
				maxDepth = d
			}
		}
		return maxDepth + 1
	default:
		return depth
	}
}
