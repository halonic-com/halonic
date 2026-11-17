# Send model calls through a company proxy (unsupported workaround)

**Unsupported. Works on Node.js 22.21 and later, and on 24.** Halonic 0.1.x has
no proxy setting. This page describes a Node.js feature that happens to cover
model calls. We don't promise it, and a later version replaces it with a real
setting.

Use it only if your network sends outgoing traffic through an `http://` proxy
and Halonic can't reach a model provider without it.

## What it covers

- Model calls to Anthropic and OpenAI, and the GitHub and Paperclip tool calls
  that the same process makes.

## What it does not cover

- Connectors and MCP servers over HTTP. They ignore the proxy and keep trying
  the network directly.
- A proxy that needs `https://`, or that is a SOCKS proxy.

## Steps

1. Stop Halonic. Node.js reads the setting only when a process starts.
2. In the shell that starts Halonic (`halonic serve`, or the agent host),
   set these three variables, then start it from that shell:

   ```sh
   export NODE_USE_ENV_PROXY=1
   export HTTPS_PROXY=http://<proxy-host>:<port>
   export NO_PROXY=localhost,127.0.0.1,::1
   ```

   If the proxy needs a user name and password, put them in the URL before
   the host, as the user name, a colon, the password and an at sign. Encode
   any special character in them as `%XX`.

3. Start Halonic from the same shell and run a model call.

## Read before you use it

- **`NO_PROXY` must list `localhost,127.0.0.1,::1`.** Node.js does not skip
  this computer on its own. Without it, calls to Halonic's own local servers go
  to your proxy. Add the Paperclip host to `NO_PROXY` too if it is a private
  address. Otherwise, if `HTTP_PROXY` is also set, a Paperclip token on an
  `http://` URL goes to the proxy in clear text.
- **The flag reaches every Node.js process started from that shell.**
  `NODE_USE_ENV_PROXY` is inherited by any Node.js child process, not only
  Halonic. Open a separate shell for it, or unset the variables afterwards.
- **A proxy that re-signs HTTPS sees your provider key.** If your company's
  proxy replaces certificates, Node.js must trust the company certificate
  (`NODE_EXTRA_CA_CERTS=<path-to-certificate>`). Whether to allow that is your
  company's decision. Halonic can't tell it is happening.
- **A password in the proxy URL travels unencrypted to an `http://` proxy.**
  That is normal for company proxies, but know it.
- `NO_PROXY` takes names, subdomains, and `host:port`. It has no address
  ranges such as `10.0.0.0/8`.
