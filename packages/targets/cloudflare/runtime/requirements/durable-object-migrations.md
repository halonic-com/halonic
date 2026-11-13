# runtime.durable-object-migrations

- Status: active
- Since: 0.1.0
- Source: HAL-6802; design review HAL-6790 (Elena, 12 Nov)

The Worker shall export every class in `durableObjectClassNames` under its own name, and its configuration (`wrangler.toml`) shall declare exactly those classes as SQLite-backed Durable Objects in its migrations, each with a binding. Its compatibility date shall be the one the test harness runs workerd with.

Rationale: Cloudflare deletes an object's data when its class is renamed or removed, and a class missing from the migrations does not start.

## Examples

- Given a class added to `durableObjectClassNames` but not to the migrations, then the configuration test fails.
- Given a class bound in the configuration but not exported by the Worker, then the Worker test fails.
