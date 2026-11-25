# assistant.build.read-docs

- Status: active
- Since: unreleased
- Source: HAL-18398 (I4b PR 2, plan rev 2 on HAL-18271, sections 2.1 to 2.3); HAL-524 and HAL-525

When the host gives it a docs client, the Build chat shall offer the model a `read_docs` tool that takes a `url` and reads one public docs page as text. It shall fetch nothing while the workspace isn't trusted. It shall refuse, before any request, an address that isn't `https:`, that has a user name, a password, a port other than 443 or a query (`?`), or whose host is an IP address, `localhost` or a private name; it shall drop the fragment. Before the first fetch from a host in a chat it shall fetch nothing, ask the host to show the person a card for that exact host, and answer that it waits for the person; a host the person declined shall not be asked again in that chat. It shall fetch an allowed address once, as a `GET` with only a fixed `Accept` and `User-Agent`, never following a redirect, within 15 seconds and 1 MiB, and read only `text/html`, `text/plain` and `text/markdown`. A `3xx` shall answer where the page moved to. A page shall be read as text with `htmlToText`, without hidden characters, with the hidden-text warning when its HTML hides text, cut to 40,000 characters, and inside the untrusted fence. Every call, refused ones included, shall add a line to the chat's docs log with the time, the address without its query, the outcome, the status, the bytes read and, for a `3xx`, its `Location`; the log shall never hold a request header or the page's text.

## Examples

- Given a trusted workspace and a chat that never asked for `docs.example.com`,
  when the model calls `read_docs` with `https://docs.example.com/api`,
  then nothing is fetched, the host is asked to show a card for `docs.example.com`, and the result says it waits for the person.
- Given the person allowed `docs.example.com` in the chat,
  when the model calls `read_docs` with `https://docs.example.com/api`,
  then the page is fetched once, as a `GET` without `Cookie` or `Authorization`, and comes back as text inside the untrusted fence.
- Given any workspace,
  when the model calls `read_docs` with `https://docs.example.com/api?key=1`, `http://docs.example.com/`, `https://127.0.0.1/` or `https://localhost/`,
  then nothing is fetched, the result says why, and the log has a line for it.
- Given the site answers `302` with a `Location`,
  when the model calls `read_docs`,
  then the redirect isn't followed, the result names where the page moved to, and the log line holds that `Location`.
- Given the site sends a 2 MiB body, or sends nothing for 15 seconds,
  when the model calls `read_docs`,
  then it stops at the limit and the result says nothing was read.
