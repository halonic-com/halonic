# server.route-table

- Status: active
- Since: unreleased
- Source: HAL-13217; selling layer design (HAL-12483), sections 13.4 and 16.7

Where the server is built for many users (`users.mode: many`), it shall answer every request only through one declared route table. Each entry shall name its method, its path, who may call it (anyone, a signed webhook sender, or a signed-in caller) and what it does with runs (reads one, changes one, starts one, lists them, or none). A path segment that stands for a run id shall match only a well-formed run id. A request that matches no entry shall get the Studio page or the same 404 as an unknown address, before any session is checked, and every run route in the table shall need a session.

Rationale: a test can then walk every route of a kind from the table itself, so a route added later can't skip the rules for whose runs it reaches.

## Examples

- Given the table, then every entry that reads, changes, starts or lists runs needs a session.
- Given `GET /api/runs/<id>/` with a trailing slash, or a run id that is no run id, then the answer is 404 `not_found`, signed in or not.
- Given a method and path the table doesn't hold, then the answer is 404 `not_found`, signed in or not.
