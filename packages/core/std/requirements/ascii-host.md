# std.ascii-host

- Status: active
- Since: 0.1.0
- Source: HAL-188 (the trust prompt shows and hashes hosts in ASCII form, HAL-65 section 4)

The std package shall write a host name in its ASCII form: lowercase, with Unicode NFC applied, and each label that holds a non-ASCII character written as `xn--` plus its Punycode (RFC 3492).

## Examples

- Given `MCP.Acme.test`, when it is written in ASCII, then it is `mcp.acme.test`.
- Given `Bücher.example`, `BÜCHER.example` or `xn--bcher-kva.example`, when it is written in ASCII, then it is `xn--bcher-kva.example`.
- Given `mcp.асme.test` with a Cyrillic а and с, when it is written in ASCII, then it is `mcp.xn--me-6kc2e.test`, not `mcp.acme.test`.
