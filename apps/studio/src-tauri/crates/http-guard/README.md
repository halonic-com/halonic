# halonic-http-guard

Decides which outbound HTTP requests the Studio page may have the shell make for it (HAL-10348). Plain Rust with no Tauri types; the shell's `http_fetch` command wraps it and does the network call.

Why the shell makes the call: most model providers send no CORS headers for the app's own origin, so the webview's `fetch` works for some and not for others, and a key in a webview request is visible to the page's network layer. One path through the shell fixes both.

The guard refuses a request before any network call, and the shell asks it again for every redirect hop and for every address a name resolves to:

- only `http` and `https`, and no user name or password in the address;
- plain `http` only to this computer or a private network, never to a public address;
- never an unspecified, multicast, broadcast or link-local address (the last holds cloud metadata services);
- a fixed list of methods, and no header that sets the connection itself (`Host`, `Content-Length`, `Connection`, …);
- a body of at most 8 MiB, an answer of at most 32 MiB.

When `HTTPS_PROXY` names a proxy, `route_for` decides for each hop whether it goes direct (with the checks above) or through a CONNECT tunnel to the host's name. The rules are the CLI's (`packages/adapters/http-node`, requirements `http-node.proxy-config` and `http-node.proxy-guard`): lower-case names first, an empty value counts as unset, only `http://` proxies, `HTTP_PROXY` and `ALL_PROXY` not read, an unusable setting and public plain `http` refused and never sent direct. Both sides test against `packages/adapters/http-node/test-vectors/proxy-rules.json`; change a rule in both and add its case there.
