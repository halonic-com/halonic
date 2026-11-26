# paperclip.reviewer-routing

- Status: active
- Since: unreleased
- Source: the routine reviewer added on HAL-19246; HAL-17982 (plan HAL-17450 rev 5, "Step 2" and "Safety": the path rules stay in `halonic`, only who covers each role moves to the workspace's routing, which is a trust root)

The reviewer path list shall pick a role for a pull request, `routine-reviewer` where `paperclip.routine-review` says so, otherwise `second-reviewer` where `paperclip.reviewer-paths` names Julian and `code-reviewer` where it names Liam, and `reviewerFor` shall name the agent the workspace snapshot's routing gives that role. Without a routing it shall name today's people (`liam` for the code reviewer, `julian` for the second and the routine reviewer), so it routes as before. When the routing leaves the routine reviewer out, it shall name the routing's second reviewer. A routing shall be taken only from a snapshot the snapshot loader accepts (`format.workspace-routing`); a refused snapshot gives no routing. When the routing leaves a role out, or a caller asks for an unknown role, or a name isn't an agent's url key, it shall name the routing's code reviewer, or `liam` without one, and never no one. The owner of an area shall come from the same resolver: the routing's owner for that area, the code reviewer for an area the routing leaves out, and the owner in `docs/guides/area-owners.md` while there is no routing.

## Examples

- Given any case of `paperclip.reviewer-paths`, when it is routed with no routing or with the routing `code-reviewer: liam, second-reviewer: julian`, then it goes to the same reviewer as before.
- Given the routing `code-reviewer: owen, second-reviewer: kim`, when a 120-line Studio change is routed, then it goes to `kim`; a root `package.json` change goes to `owen`.
- Given a routing with only `code-reviewer: owen`, when a 120-line Studio change is routed, then it goes to `owen`.
- Given a snapshot whose routing names the role `approver`, an empty person, a `login` field, an email, an area `api-token` or a key, when it is read, then it gives no routing and every pull request goes to today's reviewer.
- Given no routing, when the resolver names the owner of Integrations, then it is `Tomas, with Ravi` from the area table; given a routing with `docs: maya` and `code-reviewer: owen`, Docs goes to `maya` and Studio to `owen`.
