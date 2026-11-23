# cloudflare-durable.name-prefix-parts

- Status: active
- Since: unreleased
- Source: HAL-17127; review of #5526 (Julian); selling layer design, section 3.2 (HAL-12483)

The run store, the run events and the scheduler shall take only a name prefix that is empty or made of parts of 1 to 64 letters, digits, `_` or `-`, each followed by `/`, the shape of a scope's prefix such as `u/<id>/`, and shall refuse any other prefix when they are built.

Rationale: a prefix with an empty part or a `.`, such as `a//` or `../`, could name objects that another scope's prefix also reaches.

## Examples

- Given the prefix `a//`, `../` or `u/a.b/`, when the run events are built, then they are refused.
- Given the prefix `u/eu_acme0000000000000/`, `o/case-1_a/` or none, when the run events are built, then they are built.
