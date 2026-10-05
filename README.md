# Pretty JSON Formatter [![GoDoc](https://godoc.org/github.com/zc310/pretty?status.svg)](http://godoc.org/github.com/zc310/pretty)

## Overview

Pretty is a high-performance Go package for formatting JSON with flexible pretty-printing capabilities, featuring customizable indentation and depth control.

## Key Features

- 🚀 **High Performance** - Optimized with `fastjson` and `bytebufferpool` for minimal memory allocation
- 🎨 **Flexible Formatting** - Configurable indentation styles and depth control
- ⚙️ **Multiple Input Types** - Supports `[]byte`, `string`, `*fastjson.Value`, and any JSON-serializable Go value
- 📏 **Depth Control** - Configurable max/min expansion depth
- 🔤 **Key Sorting** - Optionally sort object keys lexicographically
- 🔄 **Dual Output Modes** - Pretty-printed (Format) and compact (Ugly) output
## Installing

```sh
go get -u github.com/zc310/pretty
```

## Usage Examples

### Basic Usage

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "isAlive": true,
  "age": 27,
  "address": {
    "streetAddress": "21 2nd Street",
    "city": "New York",
    "state": "NY",
    "postalCode": "10021-3100"
  },
  "phoneNumbers": [
    {
      "type": "home",
      "number": "212 555-1234"
    },
    {
      "type": "office",
      "number": "646 555-4567"
    }
  ],
  "children": [
    "Catherine",
    "Thomas",
    "Trevor"
  ],
  "spouse": null
}
```

The following code:

```go
result = pretty.Format(example)
```

Will format the json to:

```json
{
  "firstName":"John",
  "lastName":"Smith",
  "isAlive":true,
  "age":27,
  "address":{"streetAddress":"21 2nd Street","city":"New York","state":"NY","postalCode":"10021-3100"},
  "phoneNumbers":[{"type":"home","number":"212 555-1234"},{"type":"office","number":"646 555-4567"}],
  "children":["Catherine","Thomas","Trevor"],
  "spouse":null
}
```

```go
package main

import (
	"fmt"
	"github.com/zc310/pretty"
)

func main() {
	jsonStr := `{"name":"John","age":30,"address":{"city":"New York","zip":"10001"}}`
	
	// Default formatting
	fmt.Println(string(pretty.Format(jsonStr)))
	
	// Compact output
	fmt.Println(string(pretty.Ugly(jsonStr)))
	
	// Custom options
	opts := &pretty.Options{
		Indent:   "    ",  // 4-space indent
		MaxDepth: 2,      // Max expansion depth
		SortKeys: true,   // Sort object keys lexicographically
	}
	fmt.Println(string(pretty.FormatOptions(jsonStr, opts)))
}
```

### Advanced Usage

```go
// Format directly from Go values
data := map[string]interface{}{
	"name": "Alice",
	"skills": []string{"Go", "JavaScript", "Python"},
}
fmt.Println(string(pretty.Format(data)))

// Handle fastjson.Value
val, _ := fastjson.Parse(`{"key":"value"}`)
fmt.Println(string(pretty.Format(val)))
```

## WebAssembly

The same formatter is available in the browser through `cmd/pretty-wasm`:

```bash
make build-wasm
make serve   # opens http://localhost:8080
```

```js
pretty.format('{"b":1,"a":{"c":2}}', { indent: '  ', sortKeys: true });
// { ok: true, output: '{\n  "a":{\n    "c":2\n  },\n  "b":1\n}', error: '' }
```

The `web` directory is a ready-to-deploy page: paste JSON on the left, click a button, read the formatted result on the right. Its UI is available in English and Chinese. `make test-wasm-web` checks the translation tables and DOM wiring. See [`cmd/pretty-wasm/README.md`](cmd/pretty-wasm/README.md) for the JS API and build details.

Online demo: <https://zc310.github.io/pretty/> — pushed to `main` is built and deployed automatically by [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

Note that the js/wasm build does not bundle `goccy/go-json`, so it accepts JSON text (`string`, `[]byte`) or `*fastjson.Value` only; serializing arbitrary Go values returns an error there.

## Command Line Tool

The `cmd/pretty` CLI reads JSON from stdin (or a file) and writes formatted output:

```sh
# Format JSON from stdin
echo '{"name":"John","age":30}' | pretty

# Compact JSON (ugly mode)
pretty -ugly -input data.json

# Custom indentation
echo '{"user":{"name":"John"}}' | pretty -indent "    "

# Limit expansion depth
echo '{"a":{"b":{"c":"d"}}}' | pretty -max-depth 2

# Sort object keys
echo '{"banana":1,"apple":2}' | pretty -sort-keys
```

CLI options: `-indent`, `-max-depth`, `-min-depth`, `-sort-keys`, `-ugly`, `-input`, `-output`, `-help`

## API Reference

### `Options` Struct

```go
type Options struct {
	Indent   string // Indentation string (default: two spaces)
	MaxDepth int    // Maximum expansion depth (0 = unlimited)
	MinDepth int    // Minimum expansion depth (0 = unlimited)
	SortKeys bool   // Sort object keys lexicographically
}
```

### Core Functions

- `Format(o any) []byte` - Format with default options
- `Ugly(o any) []byte` - Compact output (no formatting)
- `FormatOptions(o any, opts *Options) []byte` - Format with custom options

### Error-returning variants

`Format`, `Ugly` and `FormatOptions` never fail: they return the error message as the result bytes. These variants report failures as errors instead, which is what the WebAssembly build and the browser page use:

- `FormatE(o any) ([]byte, error)` - Format with default options
- `UglyE(o any) ([]byte, error)` - Compact output
- `FormatOptionsE(o any, opts *Options) ([]byte, error)` - Format with custom options

Malformed JSON yields a `*ParseError` (with the offending input attached), values that cannot be serialized yield an `*EncodeError`.

## Performance Optimization

1. **Buffer Pool Management** - Uses `bytebufferpool` to reduce memory allocations
2. **Zero-Copy Processing** - Directly operates on raw JSON bytes
3. **Optimized Depth Calculation** - Efficient nested depth computation
4. **Minimal String Operations** - Avoids unnecessary string conversions and concatenations
