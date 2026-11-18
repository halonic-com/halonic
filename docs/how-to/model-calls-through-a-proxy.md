# Send model calls and connectors through a company proxy

If your network sends outgoing traffic through an `http://` proxy, tell Halonic
with the usual environment variables. Model calls, Google sign-in, and
connectors and MCP servers over `https` then go through it.

This replaces the unsupported `NODE_USE_ENV_PROXY` workaround that Halonic
0.1.x needed. If you used it, unset `NODE_USE_ENV_PROXY` and use the steps
below instead.

## Steps

1. Stop Halonic. It reads the setting once, when it starts.
2. In the shell that starts Halonic (`halonic serve`, the CLI or the agent
   host), set:

   ```sh
   export HTTPS_PROXY=http://<proxy-host>:<port>
   export NO_PROXY=internal.example.com,.corp.example
   ```

   If the proxy needs a user name and password, put them in the URL before
   the host: the user name, a colon, the password and an at sign. Encode any
   special character in them as `%XX`.

3. Start Halonic from the same shell and run a model call.

## What goes through the proxy

- **Public `https` hosts**, such as the model providers, Google and `https`
  connectors. Halonic asks the proxy for a tunnel to the host's name and
  checks the host's certificate itself, so the proxy cannot read the traffic.
- **Never through the proxy:** this computer (`localhost`), hosts on your home
  network that you typed in yourself, and any host that `NO_PROXY` lists.
  Those connect directly, with Halonic's usual address check.
- **Refused when a proxy is set:** a public host over plain `http://`. Without
  TLS nothing ties the name to the server the proxy reached. Use `https://`,
  or add the host to `NO_PROXY` if it must be reached directly.

## If it does not work

Halonic never goes around a proxy it can't use. If the setting is unusable
(for example `socks5://…`, or no `http://` in front), or the proxy refuses or
drops the tunnel, each request that needs it fails, and nothing goes
directly instead. For now the command line doesn't give the proxy's reason: a
model call that fails this way says only that Halonic couldn't reach the
provider and to check your internet connection, in the run log and with
`--debug` too. If you see that with a proxy set, check the variable and the
proxy first. Fix the variable and restart Halonic.

## Good to know

- **`https_proxy` and `no_proxy` in lower case win** over the upper-case names,
  as in curl. An empty value counts as not set.
- **`HTTP_PROXY` is not read.** Halonic tunnels only `https`.
- **`https://` and SOCKS proxies are not supported yet.**
- **A password in the proxy URL travels unencrypted to an `http://` proxy.**
  That is normal for company proxies, but know it. Halonic never prints the
  user name or password, and never sends them to anything but the proxy.
- **`NO_PROXY` takes names, subdomains and `host:port`.** It has no address
  ranges such as `10.0.0.0/8`. `NO_PROXY=*` sends every host directly.
- **A proxy that re-signs HTTPS** only works if Halonic trusts your company's
  certificate (`NODE_EXTRA_CA_CERTS=<path-to-certificate>`). A re-signing proxy
  sees your provider key. Whether to allow that is your company's decision.
- **Programs the sandbox starts never get your proxy variables.** They get the
  sandbox's own, which lead to the sandbox's network fence and its list of
  allowed sites, not to your proxy.
- **A run's dependency install uses your proxy its own way.** When a run
  installs a program's dependencies before the sandbox starts, it hands
  `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` (the upper-case names only) to
  pnpm, which reads them by its own rules, not Halonic's.
