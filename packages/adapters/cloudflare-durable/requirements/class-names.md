# cloudflare-durable.class-names

- Status: active
- Since: 0.1.0
- Source: HAL-6795; design review HAL-6790 (Elena, 12 Nov)

The Cloudflare coordination adapter shall export every Durable Object class it defines under the name listed in `durableObjectClassNames`, and that list shall not change once deployed, because Cloudflare deletes a class's data when the class is renamed or removed.

## Examples

- Given a package whose export `CoordinationObject` is renamed,
  when the class-name test runs,
  then it fails.
- Given the exported `CoordinationObject` bound under its own name,
  when a lease is taken twice on the same key,
  then the second call answers `null`.
