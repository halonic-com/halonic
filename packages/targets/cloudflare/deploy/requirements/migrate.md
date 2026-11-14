# deploy.migrate

- Status: active
- Since: 0.1.0
- Source: HAL-6704, HAL-6804; build plan 3a (HAL-198); multi-cloud ADR 5.6

The deploy shall apply each migration the database hasn't applied yet, oldest first, and record each one in the same D1 batch as its statements, so a migration and its record happen together or not at all. It shall stop with a typed error, before changing anything, when the database holds a migration this version doesn't know. In `plan` mode it shall list the migrations it would apply and make no change.

Rationale: a failed deploy must leave the database in a state the previous version still runs on, and code must never run against a schema newer than it understands.

## Examples

- Given a database with migrations 1 and 2 applied and a version that knows 1 to 3, then the deploy applies 3 only.
- Given a database that has applied a migration this version doesn't know, then the deploy stops with `schema-newer-than-cli` and applies nothing.
- Given `plan` mode, then it lists the pending migrations and no call that changes something is made.
