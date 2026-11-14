# deploy.provision

- Status: active
- Since: 0.1.0
- Source: HAL-6704; build plan 3a (HAL-198); multi-cloud ADR 5.6

The deploy shall find the Worker, the D1 database `<worker>-data` and the R2 bucket `<worker>-blobs` by name, and create the database and bucket when they are missing. It shall mark what it creates, and stop with a typed error naming each resource it found that carries no mark, unless `adopt` is set. In `plan` mode it shall list what it would create, use or adopt and make no change.

Rationale: a name can collide with something the user already has in their account, and a deploy must never overwrite or fill a resource it did not make without being told to.

## Examples

- Given an account with no resources, then the plan lists the database and bucket as `create`, and a deploy creates them and marks them.
- Given a database named `<worker>-data` that has no mark and no `adopt`, then the deploy stops with `unmarked-resources` naming it, and creates nothing.
- Given `plan` mode, then no call that changes something is made.
