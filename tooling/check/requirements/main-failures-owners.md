# check.main-failures-owners

- Status: active
- Since: unreleased
- Source: HAL-17982 (plan HAL-17450 rev 5, "Step 2": area owners come from the workspace's routing; HAL-12539 for the nightly)

When `main-failures` names the owner of an area, it shall take it from the routing resolver (`paperclip.reviewer-routing`): the workspace snapshot's routing when it is given one, the routing's code reviewer for an area that routing leaves out, and the owner in `docs/guides/area-owners.md` while it has no routing or the snapshot's routing is refused.

## Examples

- Given no routing, when the nightly reports every area, then Integrations is owned by `Tomas, with Ravi` and Docs by `Maya`.
- Given a routing with `docs: maya` and `code-reviewer: owen`, when the nightly reports every area, then Docs is owned by `maya` and Studio by `owen`.
- Given a snapshot whose routing names an area `github-login`, when the nightly reports every area, then every owner is the area table's.
