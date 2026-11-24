# action-steppers.stepper-request

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 7.1 and 7.3; ToolScript ADR on HAL-17560, section 6; task HAL-17517; task HAL-17834 (the `server-session` block)

When a `halonic.stepper-request/1` document is validated against the catalog, the action-steppers package shall take it only when it is at most 16 KB of JSON with at most 20 blocks, each block is a `use` of a shipped definition, a `step` of a reviewed step type or a `browser` block (or the request's only block is a `server-session` block, which `action-steppers.server-session-request` covers), every block's parameters pass its definition's strict schema, and every `browser` block opens an `https` address of printable characters only, without a user name, password, port, query or fragment, on an allow-listed host, whose path, decoded once, holds no `.` or `..` segment and starts with one of that host's path prefixes, and whose result pattern, if any, uses only literals, `\d`, `\w`, escaped punctuation, classes and counts, so it matches in bounded time, with at most 10 instruction lines of at most 300 characters. Otherwise it shall return every reason, each naming its block. A taken request shall come with its touches, the service and exact targets of each block, and its risk, the highest of its blocks, where a `browser` block counts as `admin`. The block schema shall be exported on its own as `stepperBlockSchema`.

## Examples

- Given a request whose block 1 is a `step` naming `github.delete-repo@1`, which isn't in the catalog,
  when it is validated,
  then it is refused with a reason starting `block 1:`.
- Given a `browser` block on `https://evil.example`, `http://github.com/…` or `https://someone@github.com/…`,
  when it is validated,
  then it is refused with a reason naming that block.
- Given a `browser` block whose address holds a tab between two dots, or a `.` or `%2e` segment,
  when it is validated,
  then it is refused with a reason naming that block.
- Given a `browser` block whose result pattern is `^(a+)+$`,
  when it is validated,
  then it is refused.
- Given a request with one `browser` block on an allowed GitHub page,
  when it is validated,
  then its risk is `admin`.
- Given a request setting a variable on the invented repository `acme/app` and adding a DNS record to the zone `acme.example`,
  when it is validated,
  then its touches name `acme/app` and `acme.example`.
