# server.run-access

- Status: active
- Since: unreleased
- Source: HAL-13217; selling layer design (HAL-12483), sections 3.3, 13.4 and 16.7; threat model (HAL-13208)

Where the server is built for many users (`users.mode: many`), it shall record who starts each run, and whether the run is `private` or shared with the `organisation`, before the run starts, and never change who started it afterwards. A run's content (its summary, events and answers) shall reach only whoever started it, or any member of the scope when it is shared. An owner or admin of an organisation shall see who started someone else's private run, when, which workflow, its status and its cost, but not its content. Only whoever started a run shall answer it or continue it; they, or an owner or admin of the organisation, may cancel it. A caller who may see a run but not act on it shall get 403 `run_action_forbidden`; a caller who may not see it shall get the same 404 as for a run that doesn't exist. A start that names a run id another member already holds shall start nothing and answer what reading that run answers. `GET /api/waiting-runs` shall list only the caller's own runs. The routes shall take these decisions from one place, never compare scopes or members themselves.

Rationale: members of one organisation share a scope, so a run id alone must never let one member read, answer or take over another member's run.

## Examples

- Given Alice's private run, then Bob, a member of her organisation, gets 404 on every run route for it, a start with its id included, and its starter stays Alice.
- Given Alice's shared run, then Bob can read it and gets 403 when he answers or cancels it.
- Given Alice's private run, then an admin sees its starter and status but not its content, and can cancel it.
