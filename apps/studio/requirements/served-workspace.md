# studio.served-workspace

- Status: active
- Since: 0.1.0
- Source: flow-workspace 2.5 (revision 6), HAL-1291, HAL-9489 (`GET /api/workspace`)

When the served Studio starts, it shall ask the computer which workspace it serves, with `GET /api/workspace` on the page's own address and the page's session, and name its workspace after the answer. The answer shall have exactly a `name`, a `sample` flag and a `folder`; any other answer, a refusal or no answer shall count as no answer. While it asks, the page shall keep the "Starting Halonic…" text. If the computer gives no answer, the served Studio shall still open its window, with no workspace name and no workspace row on More.

## Examples

- Given the computer answers `{ "name": "Acme", "sample": false, "folder": "~/Projects/acme" }`,
  then the window's title and More page use "Acme" and `~/Projects/acme`.
- Given the computer answers 401 or a body that isn't those three fields,
  then the window opens with no workspace name, and More has no workspace row.
- Given the page is stopped before the computer answers,
  then no window is drawn.
