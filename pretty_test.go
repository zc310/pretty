package pretty

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/valyala/fastjson"
)

func TestFormat(t *testing.T) {
	tests := []struct {
		name     string
		input    any
		opts     *Options
		expected string
	}{
		{
			name: "simple object with default options",
			input: map[string]any{
				"name": "John",
				"age":  30,
			},
			opts: nil,
			expected: `{
  "age":30,
  "name":"John"
}`,
		},
		{
			name: "nested object with default options",
			input: map[string]any{
				"user": map[string]any{
					"name": "John",
					"address": map[string]any{
						"city": "NYC",
						"zip":  10001,
					},
				},
			},
			opts: nil,
			expected: `{
  "user":{
    "address":{
      "city":"NYC",
      "zip":10001
    },
    "name":"John"
  }
}`,
		},
		{
			name: "array with default options",
			input: []any{
				map[string]any{"id": 1, "name": "Alice"},
				map[string]any{"id": 2, "name": "Bob"},
			},
			opts:     nil,
			expected: "[\n  {\"id\":1,\"name\":\"Alice\"},\n  {\"id\":2,\"name\":\"Bob\"}\n]",
		},
		{
			name:     "ugly format",
			input:    map[string]any{"name": "John", "age": 30},
			opts:     &Options{MaxDepth: 0, MinDepth: 0},
			expected: `{"age":30,"name":"John"}`,
		},
		{
			name: "max depth limit - should compact at depth 1",
			input: map[string]any{
				"level1": map[string]any{
					"level2": map[string]any{
						"level3": "value",
					},
				},
			},
			opts: &Options{Indent: "  ", MaxDepth: 2, MinDepth: 0},
			expected: `{
  "level1":{
    "level2":{"level3":"value"}
  }
}`,
		},
		{
			name: "min depth limit - compact if shallow",
			input: map[string]any{
				"name": "John",
				"age":  30,
			},
			opts:     &Options{Indent: "  ", MaxDepth: 0, MinDepth: 2},
			expected: `{"age":30,"name":"John"}`,
		},
		{
			name: "deeply nested with max depth",
			input: map[string]any{
				"a": map[string]any{
					"b": map[string]any{
						"c": map[string]any{
							"d": "value",
						},
					},
				},
			},
			opts: &Options{Indent: "  ", MaxDepth: 2, MinDepth: 0},
			expected: `{
  "a":{
    "b":{"c":{"d":"value"}}
  }
}`,
		},
		{
			name:  "custom indent",
			input: map[string]any{"name": "John", "age": 30},
			opts:  &Options{Indent: "    ", MaxDepth: 1 << 30, MinDepth: 0},
			expected: `{
    "age":30,
    "name":"John"
}`,
		},
		{
			name: "fastjson.Value input",
			input: func() *fastjson.Value {
				var p fastjson.Parser
				v, _ := p.Parse(`{"test":"value"}`)
				return v
			}(),
			opts: nil,
			expected: `{
  "test":"value"
}`,
		},
		{
			name:     "string input",
			input:    `{"name":"John","age":30}`,
			opts:     nil,
			expected: `{"age":30,"name":"John"}`,
		},
		{
			name:  "invalid json string",
			input: `{invalid}`,
			opts:  nil,
			expected: `parse error: cannot parse JSON: cannot parse object: cannot find opening '"" for object key; unparsed tail: "invalid}"
json: {invalid}`,
		},
		{
			name: "nil value",
			input: map[string]any{
				"field": nil,
			},
			opts: nil,
			expected: `{
  "field":null
}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runFormatCase(t, tt.input, tt.opts, tt.expected)
		})
	}
}

func runFormatCase(t *testing.T, input any, opts *Options, expected string) {
	t.Helper()
	result := FormatOptions(input, opts)

	var want any
	if err := json.Unmarshal([]byte(expected), &want); err != nil {
		// expected is not valid JSON (e.g. an error string) - compare verbatim
		if string(result) != expected {
			t.Errorf("Format() got = %q, want %q", result, expected)
		}
		return
	}

	var got any
	if err := json.Unmarshal(result, &got); err != nil {
		t.Errorf("Failed to unmarshal result (%s): %v", result, err)
		return
	}
	if !deepEqual(got, want) {
		t.Errorf("Format() got = %s, want %s", result, expected)
	}
}

func TestUgly(t *testing.T) {
	input := map[string]any{
		"name": "John",
		"age":  30,
	}
	result := Ugly(input)
	expected := `{"age":30,"name":"John"}`

	var got, want any
	json.Unmarshal(result, &got)
	json.Unmarshal([]byte(expected), &want)

	if !deepEqual(got, want) {
		t.Errorf("Ugly() got = %s, want %s", result, expected)
	}
}

func TestFormatOptions_NilOptions(t *testing.T) {
	input := map[string]any{"test": "value"}
	result1 := FormatOptions(input, nil)
	result2 := Format(input)

	if !bytes.Equal(result1, result2) {
		t.Errorf("FormatOptions(nil) should equal Format(), got %s, want %s", result1, result2)
	}
}

func TestFormatOptions_EmptyIndent(t *testing.T) {
	input := map[string]any{"test": "value"}
	opts := &Options{Indent: "", MaxDepth: 1, MinDepth: 1}
	result := FormatOptions(input, opts)
	expected := FormatOptions(input, nil)

	if !bytes.Equal(result, expected) {
		t.Errorf("Empty indent should use default, got %s, want %s", result, expected)
	}
}

func TestFormatOptions_SortKeys(t *testing.T) {
	input := `{"banana":1,"apple":2,"cherry":3}`

	unsorted := FormatOptions(input, &Options{Indent: "  ", MaxDepth: 2, MinDepth: 0, SortKeys: false})
	sorted := FormatOptions(input, &Options{Indent: "  ", MaxDepth: 2, MinDepth: 0, SortKeys: true})

	expected := `{
  "apple":2,
  "banana":1,
  "cherry":3
}`
	if string(sorted) != expected {
		t.Errorf("SortKeys=true got = %s, want %s", sorted, expected)
	}

	if bytes.Equal(sorted, unsorted) && string(sorted) != expected {
		t.Errorf("SortKeys should change output for unordered input")
	}
}

func TestGetDepth(t *testing.T) {
	tests := []struct {
		name     string
		json     string
		expected int
	}{
		{
			name:     "null value",
			json:     `null`,
			expected: 0,
		},
		{
			name:     "simple string",
			json:     `"test"`,
			expected: 0,
		},
		{
			name:     "simple number",
			json:     `123`,
			expected: 0,
		},
		{
			name:     "empty object",
			json:     `{}`,
			expected: 0,
		},
		{
			name:     "empty array",
			json:     `[]`,
			expected: 0,
		},
		{
			name:     "one level object",
			json:     `{"a":1,"b":2}`,
			expected: 1,
		},
		{
			name:     "two levels",
			json:     `{"a":{"b":1}}`,
			expected: 2,
		},
		{
			name:     "three levels",
			json:     `{"a":{"b":{"c":1}}}`,
			expected: 3,
		},
		{
			name:     "nested array",
			json:     `[[[1]]]`,
			expected: 3,
		},
		{
			name:     "mixed object and array",
			json:     `{"a":[{"b":1}]}`,
			expected: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var p fastjson.Parser
			v, err := p.Parse(tt.json)
			if err != nil {
				t.Fatalf("Failed to parse: %v", err)
			}
			got := getDepth(v, 0)
			if got != tt.expected {
				t.Errorf("getDepth() = %d, want %d", got, tt.expected)
			}
		})
	}
}

func BenchmarkFormat(b *testing.B) {
	input := map[string]any{
		"name":    "John Doe",
		"age":     30,
		"address": map[string]any{"city": "NYC", "zip": 10001},
		"hobbies": []string{"reading", "gaming", "coding"},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Format(input)
	}
}

func BenchmarkFormatDeepNested(b *testing.B) {
	input := map[string]any{}
	current := input
	for i := 0; i < 100; i++ {
		child := map[string]any{"level": i}
		current["level"] = child
		current = child
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Format(input)
	}
}

func BenchmarkUgly(b *testing.B) {
	input := map[string]any{
		"name":    "John Doe",
		"age":     30,
		"address": map[string]any{"city": "NYC", "zip": 10001},
		"hobbies": []string{"reading", "gaming", "coding"},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Ugly(input)
	}
}

func BenchmarkFormatWithMaxDepth(b *testing.B) {
	input := map[string]any{
		"level1": map[string]any{
			"level2": map[string]any{
				"level3": map[string]any{
					"level4": "value",
				},
			},
		},
	}
	opts := &Options{MaxDepth: 2, MinDepth: 0}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		FormatOptions(input, opts)
	}
}

// deepEqual compares two values recursively for testing
func deepEqual(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}

	// Convert to JSON and compare strings
	aj, _ := json.Marshal(a)
	bj, _ := json.Marshal(b)
	return bytes.Equal(aj, bj)
}
