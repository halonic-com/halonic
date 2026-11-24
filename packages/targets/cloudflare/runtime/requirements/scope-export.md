# runtime.scope-export

- Status: active
- Since: unreleased
- Source: selling layer S1-4 (HAL-13216, HAL-12478); design 13.7 (HAL-13272); export record for Cloud (HAL-13279, H5 and H6)

When the admin export's manifest or one of its files is asked for with `?scope=`, the Worker shall read the scope as a session's scope is read, `u/<id>` or `o/<id>` and nothing else, answer 400 `bad_scope` and open no store when it isn't one, and otherwise answer from that scope's stores alone; without `?scope=` it shall answer from the deployment's own stores as before. A scope's export shall decide from the viewer how much it holds: the operator, who holds the admin key, and the scope's owner shall get every file of the scope, private runs included; an organisation's admin shall get the run list's metadata of its runs (id, starter, visibility, status, start) and no file; a member, or a principal of another scope, shall be refused before any store is read. Each export shall name its kind, `full` or `metadata`, and the actor who asked, by id and never by name.

Rationale: a person's or an organisation's data can be handed over or checked one scope at a time. A private run's content goes to an owner alone, so the store decides what an admin gets, not the route; Cloud records each export, the admin's included, from the kind and actor the export gives back.

## Examples

- Given `GET /admin/export?scope=u/eu_a…`, then the manifest lists that scope's files, and a file of it is answered with `?scope=` too.
- Given `?scope=u/eu_a…/` or `?scope=x/eu_a…`, then the manifest and the file routes answer 400 `bad_scope`.
- Given an organisation with a member's private run, when its owner exports it, then the export is `full`, names the owner's id and holds the run's log.
- Given the same organisation, when an admin exports it, then the export is `metadata`, names the admin's id and holds the run's metadata and none of its events.
- Given the same organisation, when a member or the owner of another organisation exports it, then it is refused and nothing is read.
