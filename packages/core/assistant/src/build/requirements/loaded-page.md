# assistant.build.loaded-page

- Status: active
- Since: unreleased
- Source: HAL-18399 (I4b PR 3, plan rev 2 on HAL-18271, section 2.3, with Liam's change A); HAL-524 and HAL-525; HAL-19170 (a request log counts as untrusted text too, HAL-18391 plan section 2.3)

The Build chat shall count untrusted text as loaded once a `read_docs` result with anything a site sent, or a `read_request_log` result with the log's lines, is in the chat's messages, and for the rest of the chat. From a site that is a page, a redirect (whose target the site chose), or any other answer of the site; only the answers `read_docs` gives before any request (a refused address, an untrusted workspace, a site waiting for the person, declined or not named) shall not count, nor the answers `read_request_log` gives without lines. Before each model turn, while untrusted text is loaded, the chat shall offer only the tools in `builderToolNames`, and a call to any other tool shall not run. While untrusted text is loaded, `read_docs` shall ask the person about a site it wasn't asked about before only when the person named that site in their own messages; for any other site it shall fetch nothing, ask nothing, answer why and log the call as refused. Both rules shall be read again before each model turn and on each call, so text loaded in the middle of an answer counts from the next turn on. A proposal whose result comes after a page was loaded shall be known as written after reading that page's site. The gate on the hosts and sign-ins the person named (`assistant.build.named-hosts-secrets`) shall still refuse any host a page named and the person didn't.

## Examples

- Given a chat where a page from `docs.example.com` is loaded and the chat was also given a connector's tool `send_mail`,
  when the next model turn starts,
  then it isn't offered `send_mail`.
- Given that page names `other.example.com` and the person didn't,
  when the model calls `read_docs` with `https://other.example.com/hook`,
  then nothing is fetched, the person isn't asked, and the call is logged as refused.
- Given the person named `api.notes.example.com`,
  when the model calls `read_docs` with `https://api.notes.example.com/docs` after the page,
  then the person is asked about `api.notes.example.com`.
- Given one answer whose turn 1 gets a `302` from `docs.example.com`,
  when turn 2 starts,
  then it isn't offered `send_mail` and gets no ask for `other.example.com`.
- Given one answer whose turn 1 reads the page,
  when turn 2 starts,
  then it isn't offered `send_mail` and gets no ask for `other.example.com`.
- Given a page was loaded,
  when the model proposes a permission sheet that asks for `other.example.com`,
  then the proposal is refused, and one made after the page is known as written after reading `docs.example.com`.
- Given one answer whose turn 1 reads the request log of the chat's integration,
  when turn 2 starts,
  then it isn't offered `send_mail`.
