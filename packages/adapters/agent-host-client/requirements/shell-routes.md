# agent-host-client.shell-routes

- Status: active
- Since: 0.1.0
- Source: HAL-5224; `apps/studio/src-tauri/requirements/agent-host-commands.md`, `apps/studio/src-tauri/crates/agent-host/src/routes.rs`

The stand-ins' JSON routes (`agentHostRequestRoutes`) and stream routes (`agentHostStreamRoutes`) shall be exactly the routes the shell's table `ROUTES` lets a page call, with the same answer kind, so a route the stand-ins call is never refused by the shell as `unknown_route` and the shell lets through no route the stand-ins don't call.

## Examples

- Given the shell's table lists `"POST /v1/bridge/open"` as a stream route,
  when the stand-ins' routes are compared with it,
  then `agentHostStreamRoutes` holds `"POST /v1/bridge/open"` and `agentHostRequestRoutes` doesn't.
- Given a route added to `agentHostRequestRoutes` but not to the shell's table,
  when the test runs,
  then it fails, naming the route.
