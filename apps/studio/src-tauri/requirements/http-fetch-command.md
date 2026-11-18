# studio.src-tauri.http-fetch-command

- Status: draft
- Since: unreleased
- Source: HAL-10348, HAL-10372, HAL-12966; `apps/studio/src-tauri/crates/http-guard/README.md`

When the page calls `http_fetch`, the shell shall check the request with `halonic-http-guard` before any network call, resolve a host name itself and refuse the call when any address it gives is refused, and connect only to the addresses it checked. When `HTTPS_PROXY` names a proxy, the shell shall read it and `NO_PROXY` once at start by the rules of `http-node.proxy-config`, and decide for every hop by the rules of `http-node.proxy-guard`: `localhost`, a loopback or private address and a host on `NO_PROXY` go direct as above; any other host goes through the proxy as a CONNECT tunnel to its name, with the host's certificate checked by the shell; a public plain `http` hop fails as `plain_http_proxied` and an unusable setting as `proxy_refused`, and neither is ever sent direct. It shall read no other proxy variable. It shall follow redirects by hand only when the page asked, check every hop as a request of its own, stop after 5 hops as `too_many_redirects`, turn a 303 (or a 301 or 302 after a POST) into a GET without a body, and, on a hop to another origin, keep only `Accept`, `Accept-Language`, `Content-Language`, `Content-Type` and `User-Agent` and leave every other header behind. Otherwise it shall answer the redirect as it is. It shall answer any status as an answer, with its headers and body (UTF-8, lossy), refuse an answer over 32 MiB as `response_too_large`, and refuse a call that takes over 300 s as `timeout`. A refusal has a stable `kind`, and no message holds a header value or the address. The page names each call with an id of its own; the shell refuses one still in use as `call_in_use`, and stops a call when the page calls `http_fetch_abort`, reloads or closes. The served Studio gets neither command.

## Examples

- Given a name that resolves to `169.254.169.254`,
  when the page calls `http_fetch` with it,
  then the shell refuses it as `address_refused` and sends nothing.
- Given a server that answers 302 to a metadata address,
  when the page asks to follow redirects,
  then the shell refuses the hop as `address_refused`.
- Given `HTTPS_PROXY` names a proxy and a server on this computer redirects to `https://model.test/`,
  when the page asks to follow redirects,
  then the shell calls the server directly and asks the proxy for `CONNECT model.test:443`.
- Given `HTTPS_PROXY` names a proxy,
  when the page calls `http://api.example.com/`,
  then the shell refuses it as `plain_http_proxied` and sends nothing.
- Given a call in flight,
  when the page calls `http_fetch_abort` with its id,
  then the call ends as `aborted`.
