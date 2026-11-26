# format.workspace-routing

- Status: active
- Since: unreleased
- Source: HAL-17982 (plan HAL-17450 rev 5, "Step 2" and "Safety": the routing file is a trust root); the routine reviewer's role added on HAL-19246

The workspace snapshot may hold a `routing` part with `roles`, which maps `code-reviewer`, `second-reviewer`, `routine-reviewer`, `clarifier` and `merge-captain` to an agent, and `areas`, which maps at most 50 area names (an area's slug, such as `engine-and-cli`) to an agent, each filled in as empty when left out. An agent shall be named only by its url key: a lowercase letter, then at most 39 lowercase letters, digits or `-`. When `readSnapshot` reads a routing, it shall refuse the snapshot whole if the routing names another role or has any other field, names an agent with an empty name or one that isn't a url key (an email, a bot login, capitals or `_`), holds a key in an agent's name (`value-looks-like-key`), or names an area like an account or credential field, such as `github-login` or `api-token` (`routing-area-looks-like-account`). A snapshot without `routing` shall be read without one, so each reader keeps its own defaults.

## Examples

- Given `roles: { code-reviewer: liam, second-reviewer: julian }` and `areas: { engine-and-cli: priya }`, when the snapshot is read, then it is accepted with that routing.
- Given a role `approver`, or a field `login` next to `roles`, when the snapshot is read, then it is refused at `routing.roles` or `routing`.
- Given the code reviewer `""`, `liam@example.com`, `renovate[bot]`, `Liam` or `ghp_abc`, when the snapshot is read, then it is refused at `routing.roles.code-reviewer`.
- Given an area `github-login` or `api-token`, when the snapshot is read, then it is refused with `routing-area-looks-like-account` at that area.
- Given 51 areas, when the snapshot is read, then it is refused at `routing.areas`.
