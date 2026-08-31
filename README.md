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

## Performance Optimization

1. **Buffer Pool Management** - Uses `bytebufferpool` to reduce memory allocations
2. **Zero-Copy Processing** - Directly operates on raw JSON bytes
3. **Optimized Depth Calculation** - Efficient nested depth computation
4. **Minimal String Operations** - Avoids unnecessary string conversions and concatenations
