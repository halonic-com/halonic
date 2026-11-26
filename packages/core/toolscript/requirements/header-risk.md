# toolscript.header-risk

- Status: active
- Since: unreleased
- Source: Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 4 (`risk`); task HAL-17567

When a ToolScript header is checked against a capability registry, the toolscript package shall refuse it when its `risk` is lower than the highest risk of any capability in `uses` or any block in `steps`, where a `browser` block counts as `admin`, and when a capability or step type isn't in the registry. A taken header shall come with that required risk.

## Examples

- Given a header with `risk: routine` that uses the invented `acme.delete-zone@1`, an `irreversible` capability,
  when it is checked,
  then it is refused with a reason naming `risk`.
- Given a header with `risk: admin` that uses only a `routine` capability,
  when it is checked,
  then it is taken, and its required risk is `routine`.
