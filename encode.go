//go:build !(js && wasm)

package pretty

import (
	"bytes"

	"github.com/goccy/go-json"
)

// encodeValue serializes an arbitrary Go value to JSON. The js/wasm build uses
// encode_wasm.go instead so the formatter stays small in the browser.
func encodeValue(v any) ([]byte, error) {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
