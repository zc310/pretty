package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/zc310/pretty"
)

var (
	indent     = flag.String("indent", "  ", "Indentation string (default: two spaces)")
	maxDepth   = flag.Int("max-depth", 1, "Maximum depth to format, 0 means unlimited")
	minDepth   = flag.Int("min-depth", 1, "Minimum depth to format, 0 means no restriction")
	ugly       = flag.Bool("ugly", false, "Output compact JSON without indentation (overrides other options)")
	sortKeys   = flag.Bool("sort-keys", false, "Sort object keys lexicographically")
	help       = flag.Bool("help", false, "Show this help message")
	inputFile  = flag.String("input", "", "Input file path (default: stdin)")
	outputFile = flag.String("output", "", "Output file path (default: stdout)")
)

func main() {
	flag.Parse()

	if *help {
		printHelp()
		return
	}

	// 读取输入
	var data []byte
	var err error

	if *inputFile != "" {
		data, err = os.ReadFile(*inputFile)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading input file: %v\n", err)
			os.Exit(1)
		}
	} else {
		data, err = io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading stdin: %v\n", err)
			os.Exit(1)
		}
	}

	if len(data) == 0 {
		fmt.Fprintf(os.Stderr, "No input provided\n")
		os.Exit(1)
	}

	// 如果启用 ugly 模式，覆盖其他选项
	var result []byte
	if *ugly {
		result = pretty.Ugly(string(data))
	} else {
		result = pretty.FormatOptions(string(data), &pretty.Options{
			Indent:   *indent,
			MaxDepth: *maxDepth,
			MinDepth: *minDepth,
			SortKeys: *sortKeys,
		})
	}

	// 写入输出
	if *outputFile != "" {
		err = os.WriteFile(*outputFile, result, 0644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error writing output file: %v\n", err)
			os.Exit(1)
		}
	} else {
		fmt.Print(string(result))
	}
}

func printHelp() {
	fmt.Printf(`JSON Pretty Printer

Usage:
  pretty [options] < input.json
  pretty [options] -input file.json
  echo '{"key":"value"}' | pretty [options]

Options:
  -indent string
        Indentation string (default "  ")
  -max-depth int
        Maximum depth to format, 0 means unlimited (default 0)
  -min-depth int
        Minimum depth to format, 0 means no restriction (default 0)
  -ugly
        Output compact JSON without indentation (overrides other options)
  -sort-keys
        Sort object keys lexicographically
  -input string
        Input file path (default: stdin)
  -output string
        Output file path (default: stdout)
  -help
        Show this help message

Examples:
  # Format JSON from stdin
  echo '{"name":"John","age":30}' | pretty

  # Format JSON file
  pretty -input data.json

  # Compact JSON (ugly mode)
  pretty -ugly -input data.json

  # Format with custom indentation
  echo '{"user":{"name":"John"}}' | pretty -indent "    "

  # Limit formatting depth
  echo '{"a":{"b":{"c":"d"}}}' | pretty -max-depth 2

  # Sort object keys
  echo '{"b":1,"a":2}' | pretty -sort-keys

  # Read from file and write to file
  pretty -input input.json -output output.json
`)
}
