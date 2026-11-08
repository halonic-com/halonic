# contracts.id-generator

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `IdGenerator` port v1

Every `IdGenerator` adapter shall give ids that start with the prefix asked for and never give the same id twice, also when one prefix starts with another.

## Examples

- Given any generator,
  when it is asked for ids with prefix `run`,
  then each id starts with `run`.
- Given 1000 rounds of prefixes `a`, `a1`, `a_1` and `run`,
  when the ids are collected,
  then there are 4000 different ids.
