# pr-hooks: GitHub webhook receiver for the chief line (HAL-18586)

A small Node service (no dependencies) that turns GitHub webhook deliveries
into chief line posts for the pull requests a server session tracks
(`POST /chief-line/track`). It runs as its own container beside
chief-line-receiver, never inside Paperclip, so if it fails or is flooded,
Paperclip and the agents notice nothing. The PR watcher's 10-minute pass
still posts anything it misses: a delivery that never arrives costs at most
one pass of delay.

## What it does

1. Checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the
   webhook secret, compared in constant time). A missing or wrong signature
   gets 401 and nothing is read further or forwarded. An empty secret refuses
   everything.
2. Keeps only three facts, for the repositories in `PR_HOOKS_REPOS`:
   - `issue_comment` `created` on a pull request, by the team (`OWNER`,
     `MEMBER`, `COLLABORATOR`), whose body has "on head";
   - `check_run` `completed` named `ci-ok`, for each pull request whose head
     is the run's commit (merge-group runs name none);
   - `pull_request` `closed`, merged or not.
   Everything else gets 204.
3. Answers GitHub first (202), then forwards each fact to the Agent tools
   plugin's board-only `POST /chief-line/pr-event`, at most
   `PR_HOOKS_MAX_PER_MINUTE` a minute (default 30). Over the limit a fact is
   dropped with a log line; the pass catches it.

The plugin decides whether the pull request is tracked and whether the fact
is new. Webhook and pass share the markers on the chief line thread, so an
event is posted once, and the switch `chiefLine.prOutcomes` in the plugin's
settings turns both off (the plugin then answers 409 and posts nothing).

## Running it

```sh
PR_HOOKS_SECRET_FILE='<webhook secret file>' \
PR_HOOKS_TOKEN_FILE='<board credential file>' \
PR_HOOKS_FORWARD_URL='<the chief line routes base chief.mjs uses>/chief-line/pr-event?companyId=<id>' \
PR_HOOKS_REPOS=halonic-com/halonic \
PR_HOOKS_PORT=8787 \
node infra/pr-hooks/receiver.mjs
```

The two secrets are files mounted from the secret store, never arguments or
environment values, and are never logged. Point the hooks proxy's route for
GitHub at the port. Then the board adds to the halonic-pr-reader App: the
events `issue_comment`, `check_run` and `pull_request`, the proxy's URL and
the same webhook secret.

Tests: `node --test infra/pr-hooks/receiver.test.mjs` (CI runs them with the
other infra tests).
