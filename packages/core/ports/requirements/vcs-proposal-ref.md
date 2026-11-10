# ports.vcs-proposal-ref

- Status: active
- Since: 0.1.0
- Source: HAL-3354; plan point 9 on HAL-3245; engine answer point 3 (HAL-3267); `Vcs` port v2

Where a `Vcs` method takes a proposal ref, the ref shall be `refs/halonic/proposals/<id>`, with an id of 1 to 64 ASCII letters, digits, `-` and `_` that doesn't start with `-`; `checkProposalRef` shall refuse anything else, such as a branch, `HEAD`, another ref folder, an id with `/`, `.`, `..`, a space, `@{`, `~`, `^` or `:`, or an id starting with `-`, with a `RangeError` before the repository is touched.

## Examples

- Given `"refs/heads/main"`, `"HEAD"`, `"refs/halonic/proposals/../x"`, `"refs/halonic/proposals/-x"` or `"refs/halonic/proposals/"`,
  when it is checked,
  then it is refused with a `RangeError`.
- Given `"refs/halonic/proposals/run-1"`, when it is checked, then it passes.
