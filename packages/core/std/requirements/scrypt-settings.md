# std.scrypt-settings

- Status: active
- Since: 0.1.0
- Source: HAL-104 (RFC 7914 parameter limits; multi-cloud ADR section 8: hashes must fit a 128 MB Worker)

If a scrypt setting is out of the range RFC 7914 allows, or the settings need more memory than `maxMemoryBytes` (32 MiB by default), then scrypt shall throw a `RangeError` that names the setting, before it allocates any memory.

## Examples

- Given N = 1000, when scrypt runs, then a `RangeError` says the cost (N) must be a power of two.
- Given r = 0, when scrypt runs, then a `RangeError` names blockSize (r).
- Given N = 2^16 with r = 1, when scrypt runs, then a `RangeError` says N must be below 2^(16 x blockSize).
- Given N = 2^16 and r = 8, which need 64 MiB, when scrypt runs with the default limit, then a `RangeError` says it needs 67108864 bytes, more than the limit of 33554432.
- Given settings that need exactly `maxMemoryBytes`, when scrypt runs, then it derives the key.
