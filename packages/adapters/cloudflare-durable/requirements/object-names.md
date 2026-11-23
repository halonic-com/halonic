# cloudflare-durable.object-names

- Status: active
- Since: unreleased
- Source: HAL-13214; selling layer design, section 3.2 (HAL-12483)

The run store, the run events and the scheduler shall build each run object's name only from their name prefix and an id they check themselves where the name is built: the prefix shall be empty or end in `/`, and the id shall be a run id, or for the scheduler a timer key of 1 to 256 UTF-8 bytes with no `/`. They shall refuse any other prefix when built, and any other id before they name an object, so an id with a `/` or `..` can never reach the names of another scope.

Rationale: the route checks the run id too, but a check at the one place that builds the name can't be skipped by a later caller.

## Examples

- Given the prefix `u/eu_acme0000000000000/`, when run `run_1` is read, then the object asked for is `u/eu_acme0000000000000/run_1`.
- Given the prefixes `u/acme/` and `o/acme/`, when each reads run `run_1`, then they ask for two different objects.
- Given any prefix, when run `../run_1` or `run_1/x` is read, then the call is refused and no object is asked for.
- Given any prefix, when the scheduler is asked about the key `../run_1`, then the call is refused and no object is asked for.
- Given the prefix `u/acme` with no trailing `/`, when the run store is built, then it is refused.
