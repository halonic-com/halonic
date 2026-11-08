# schema-kit.string-url

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3, plan 4.1)

The `url()` check shall accept text that the WHATWG URL standard parses as an absolute URL, after trimming spaces, and report `invalid_format` otherwise; hosts with non-ASCII letters are accepted without IDNA checks.

## Examples

- Given `s.string().url()` and "https://example.com/mcp", "mailto:a@b" or "http://[::1]:3000/",
  when each is parsed,
  then each passes.
- Given the same schema and "example.com", "http://", "http://a:65536" or "https://exa mple.com",
  when each is parsed,
  then each has one `invalid_format` issue.
- Given the same schema and " https://exa\nmple.com/ ",
  when it is parsed,
  then the value is "https://example.com/".
