# pretty [![GoDoc](https://godoc.org/github.com/zc310/pretty?status.svg)](http://godoc.org/github.com/zc310/pretty) [![Go Report](https://goreportcard.com/badge/github.com/zc310/pretty)](https://goreportcard.com/report/github.com/zc310/pretty)

## Installing

```sh
$ go get -u github.com/zc310/pretty
```

## Pretty

Using this example:

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
