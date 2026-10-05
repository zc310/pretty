package pretty

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/valyala/bytebufferpool"
	"github.com/valyala/fastjson"
)

// Options represents formatting options for JSON
type Options struct {
	Indent   string // Indentation string, defaults to two spaces
	MaxDepth int    // Maximum depth to expand, 0 means unlimited
	MinDepth int    // Minimum depth to expand, 0 means no minimum restriction
	SortKeys bool   // Sort object keys lexicographically
}

var DefaultOptions = &Options{Indent: "  ", MaxDepth: 1, MinDepth: 1}

// Format formats any value with default options
func Format(o any) []byte { return FormatOptions(o, nil) }

// Ugly returns compact JSON without indentation
func Ugly(o any) []byte { return FormatOptions(o, &Options{MaxDepth: 0, MinDepth: 0}) }

// FormatOptions formats any value with custom options
func FormatOptions(o any, opts *Options) []byte {
	result, err := FormatOptionsE(o, opts)
	if err != nil {
		return []byte(legacyError(err))
	}
	return result
}

// FormatE formats any value with default options and reports failures as errors
func FormatE(o any) ([]byte, error) { return FormatOptionsE(o, nil) }

// UglyE returns compact JSON without indentation and reports failures as errors
func UglyE(o any) ([]byte, error) { return FormatOptionsE(o, &Options{MaxDepth: 0, MinDepth: 0}) }

// FormatOptionsE formats any value with custom options and reports failures as
// errors. Malformed JSON yields a *ParseError, values that cannot be serialized
// yield an *EncodeError.
func FormatOptionsE(o any, opts *Options) ([]byte, error) {
	switch v := o.(type) {
	case *fastjson.Value:
		return formatValue(v, opts, 0), nil
	case []byte:
		return formatByte(v, opts)
	case string:
		return formatByte([]byte(v), opts)
	default:
		encoded, err := encodeValue(v)
		if err != nil {
			return nil, &EncodeError{Err: err}
		}
		return formatByte(encoded, opts)
	}
}

// ParseError reports JSON that could not be parsed, together with the input that
// failed.
type ParseError struct {
	Err   error
	Input []byte
}

func (e *ParseError) Error() string { return "parse error: " + e.Err.Error() }

func (e *ParseError) Unwrap() error { return e.Err }

// EncodeError reports a Go value that could not be serialized to JSON.
type EncodeError struct {
	Err error
}

func (e *EncodeError) Error() string { return "encode error: " + e.Err.Error() }

func (e *EncodeError) Unwrap() error { return e.Err }

// legacyError renders an error the way FormatOptions has always reported it, so
// callers that expect the message inside the returned bytes keep working.
func legacyError(err error) string {
	var parseErr *ParseError
	if errors.As(err, &parseErr) {
		return fmt.Sprintf("parse error: %v\njson: %s", parseErr.Err, parseErr.Input)
	}
	var encodeErr *EncodeError
	if errors.As(err, &encodeErr) {
		return fmt.Sprintf("encode error: %v", encodeErr.Err)
	}
	return err.Error()
}

var pp fastjson.ParserPool

func formatByte(json []byte, opts *Options) ([]byte, error) {
	p := pp.Get()
	defer pp.Put(p)

	v, err := p.ParseBytes(json)
	if err != nil {
		return nil, &ParseError{Err: err, Input: json}
	}
	return formatValue(v, opts, 0), nil
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
	if opts.MinDepth != 0 && getDepth(o, 0) <= opts.MinDepth {
		return o.MarshalTo(nil)
	}
	if opts.MaxDepth != 0 && depth >= opts.MaxDepth {
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

	type kv struct {
		key []byte
		val *fastjson.Value
	}
	pairs := make([]kv, 0, obj.Len())
	obj.Visit(func(key []byte, val *fastjson.Value) {
		pairs = append(pairs, kv{key, val})
	})
	if opts.SortKeys {
		sort.Slice(pairs, func(i, j int) bool {
			return bytes.Compare(pairs[i].key, pairs[j].key) < 0
		})
	}

	buf.WriteString("{\n")
	for i := range pairs {
		if i > 0 {
			buf.WriteString(",\n")
		}
		appendIndent(buf, opts, depth+1)
		buf.WriteByte('"')
		buf.Write(pairs[i].key)
		buf.WriteString(`":`)
		buf.Write(formatValue(pairs[i].val, opts, depth+1))
	}
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

// getDepth calculates the maximum nesting depth of a JSON value
func getDepth(o *fastjson.Value, depth int) int {
	if o == nil {
		return depth
	}

	switch o.Type() {
	case fastjson.TypeObject:
		obj, _ := o.Object()
		maxDepth := depth
		hasChildren := false
		obj.Visit(func(_ []byte, v *fastjson.Value) {
			hasChildren = true
			if d := getDepth(v, depth+1); d > maxDepth {
				maxDepth = d
			}
		})
		if !hasChildren {
			return depth
		}
		return maxDepth
	case fastjson.TypeArray:
		arr, _ := o.Array()
		if len(arr) == 0 {
			return depth
		}
		maxDepth := depth
		for _, v := range arr {
			if d := getDepth(v, depth+1); d > maxDepth {
				maxDepth = d
			}
		}
		return maxDepth
	default:
		return depth
	}
}
