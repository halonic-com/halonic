# check.guard-base-is-built-on-commit

- Status: active
- Since: 0.1.0
- Source: HAL-5568

When CI runs the requirement guard on a pull request, the guard's base side shall be the main commit the pull request's merge ref was built on, so the guard reports only the pull request's own changes and nothing that main changed after the branch point.

## Examples

- Given a branch that left main at commit A and does not touch a requirement,
  when main moves on to commit B and changes that requirement,
  then the base side is B and the guard reports nothing.
- Given the same branch,
  when the base side were A (the older `pull_request.base.sha`),
  then the guard would report the requirement that main changed.
