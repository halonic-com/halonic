# Decision: a request log read counts as untrusted text, like a docs page

- Approval: HAL-19170, the plan is HAL-18391 rev 2 section 2.3 (Liam's OK, 26 Nov); Liam approves this note in review
- Kind: security
- Task: HAL-19170

## What changes

- `assistant.build.loaded-page` now speaks of untrusted text instead of a page. A `read_request_log` result with
  the log's lines sets it, as a `read_docs` result with anything a site sent already did. A `read_request_log`
  answer without lines (untrusted workspace, a chat not about a local integration, an empty log) doesn't.
- While untrusted text is loaded, the chat offers only `builderToolNames` from the next model turn on, and the
  `read_docs` rule for sites the person didn't name applies, as before for a page.
- The named-hosts gate (`assistant.build.named-hosts-secrets`) is unchanged: a host that appears only in the log,
  as a refused host, is refused; the same host typed by the person is allowed.

## Why

A request log carries `failureCause.detail`, field names and paths, which a hostile integration can write freely,
reply text included. That is the same risk as a docs page, so it gets the same rules: everything from the log
reaches the model only inside `fenceUntrusted`, and once it has, the chat drops every tool outside the builder's
own.

## Tests

No test is removed or weakened. `loaded-page.test.ts` keeps all its cases; only its scripted model moved to a
shared test helper. `read-request-log.test.ts` covers the six cases from the task, and
`workspace-assistant-request-log.test.ts` covers Studio offering the tool only in a trusted chat about a local
integration.

## Covers

- assistant.build.loaded-page
