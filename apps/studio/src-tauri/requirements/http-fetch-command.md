# studio.src-tauri.http-fetch-command

- Status: draft
- Since: unreleased
- Source: HAL-10348, HAL-10372; `apps/studio/src-tauri/crates/http-guard/README.md`

When the page calls `http_fetch`, the shell shall check the request with `halonic-http-guard` before any network call, resolve a host name itself and refuse the call when any address it gives is refused, and connect only to the addresses it checked, with no proxy. It shall follow redirects by hand only when the page asked, check every hop as a request of its own, stop after 5 hops as `too_many_redirects`, turn a 303 (or a 301 or 302 after a POST) into a GET without a body, and, on a hop to another origin, keep only `Accept`, `Accept-Language`, `Content-Language`, `Content-Type` and `User-Agent` and leave every other header behind. Otherwise it shall answer the redirect as it is. It shall answer any status as an answer, with its headers and body (UTF-8, lossy), refuse an answer over 32 MiB as `response_too_large`, and refuse a call that takes over 300 s as `timeout`. A refusal has a stable `kind`, and no message holds a header value or the address. The page names each call with an id of its own; the shell refuses one still in use as `call_in_use`, and stops a call when the page calls `http_fetch_abort`, reloads or closes. The served Studio gets neither command.

## Examples

- Given a name that resolves to `169.254.169.254`,
  when the page calls `http_fetch` with it,
  then the shell refuses it as `address_refused` and sends nothing.
- Given a server that answers 302 to a metadata address,
  when the page asks to follow redirects,
  then the shell refuses the hop as `address_refused`.
- Given a call in flight,
  when the page calls `http_fetch_abort` with its id,
  then the call ends as `aborted`.
