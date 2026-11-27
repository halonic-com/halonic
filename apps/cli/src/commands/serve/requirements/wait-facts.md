# cli.commands.serve.wait-facts

- Status: active
- Since: unreleased
- Source: HAL-19450 (the served Studio's wait card, HAL-19383 gap G3); `server.waiting-run-context`

The `halonic serve` command shall give the server the served workspace's workflows and test models, as the files of the live version say, read again at every request, so `GET /api/waiting-runs` can say what each waiting run is about: a hub's workflow by its id, with its name, its start field (`start.field`) and each step's description as written, and whether a provider is the test model, which its file marks `type: mock` whatever its id, as the CLI's "Sample answers" line decides it.

## Examples

- Given Acme's hub `support` with Support reply, which starts with `mail` and waits at `review`, then the server is given the name "Support reply", the start field `mail` and `review`'s description as written.
- Given a provider `sample` whose file says `type: mock`, then the server is told `sample` is the test model, and a provider `openai` isn't.
