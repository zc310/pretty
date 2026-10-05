//go:build js && wasm

package pretty

import "errors"

// encodeValue is unavailable in the js/wasm build: that build pulls in no
// serialization dependency and only accepts JSON text (string, []byte) or an
// already parsed *fastjson.Value. encode.go holds the full implementation.
func encodeValue(any) ([]byte, error) {
	return nil, errors.New("serializing Go values is unsupported in the js/wasm build, pass a JSON string, []byte or *fastjson.Value")
}
