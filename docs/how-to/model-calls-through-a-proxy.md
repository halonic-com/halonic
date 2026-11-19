# Send model calls and connectors through a company proxy

If your network sends outgoing traffic through an `http://` proxy, tell Halonic
with the usual environment variables. Model calls, Google sign-in, and
connectors and MCP servers over `https` then go through it.

This replaces the unsupported `NODE_USE_ENV_PROXY` workaround that earlier
builds of Halonic needed. If you used it, unset `NODE_USE_ENV_PROXY` and use
the steps below instead.

## Steps

1. Stop Halonic. It reads the setting once, when it starts.
2. In the shell that starts Halonic (`halonic serve`, the CLI, the agent
   host or the Studio desktop app), set:

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
  network written as an IP address, such as `http://192.168.1.20:11434`, and
  any host that `NO_PROXY` lists. Those connect directly, with Halonic's usual
  address check.
- **A name counts as public.** Only `localhost` and IP addresses count as this
  computer or your home network. A name such as `gpu-box.lan` counts as a
  public host, and if its address turns out to be on this computer or your
  home network, the address check refuses it, with or without a proxy and
  even when `NO_PROXY` lists it. Write the IP address instead.
- **Refused when a proxy is set:** a public host over plain `http://`. Without
  TLS nothing ties the name to the server the proxy reached. Use `https://`,
  or, for a host whose address is public, add it to `NO_PROXY` if it must be
  reached directly.

## If it does not work

Halonic never goes around a proxy it can't use. If the setting is unusable
(for example `socks5://…`, or no `http://` in front), or the proxy refuses or
drops the tunnel, or the provider's address starts with `http://` and isn't
`localhost` or an IP address on your network while a proxy is set (see
"Refused when a proxy is set" above), each request that
needs it fails, and nothing goes directly instead. For now the command line
doesn't give the reason: a model call that fails this way says only that
Halonic couldn't reach the provider and to check your internet connection, in
the run log and with `--debug` too. If you see that with a proxy set, check
the variable, the proxy and the provider's address first. Fix the setting and
restart Halonic.

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
- **The Studio desktop app reads the variables only if it can see them.** An
  app started from the Start menu, the Dock or Finder usually doesn't get
  variables set in a terminal. Start Studio from the shell where you set them,
  or set them for your whole account.
- **Programs the sandbox starts never get your proxy variables.** They get the
  sandbox's own, which lead to the sandbox's network fence and its list of
  allowed sites, not to your proxy.
- **A run's dependency install uses your proxy its own way.** When a run
  installs a program's dependencies before the sandbox starts, it hands
  `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` (the upper-case names only) to
  pnpm, which reads them by its own rules, not Halonic's.
