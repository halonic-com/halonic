# Studio hands a trusted plugin its own secrets; the agent host keeps them in memory only

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

In Studio, a plugin's backend runs in the agent host, in a sandboxed runner
(`agent-host.plugin-routes`). Its secrets don't reach it: Studio keeps a
plugin's secrets in the OS keychain under `plugin__<id>__<secret>`
(`plugins.plugin-secrets`), and the host can't read the keychain, so the host
gives every backend `secrets: { get: async () => null }`. Two things are
blocked by that (HAL-13652): a backend's own API keys (`as: bearer`, `header`
or `form`), and a plugin sign-in that names a `clientSecret`, which the host's
sign-in answers with `client_secret_missing`.

We looked at three places the host could read them from:

1. **A sealed store in the profile**, like Google's client secret store: Studio
   writes each secret through a host route once, and the host seals it with
   the profile's `token-key`. It serves the sign-in callback and a token
   refresh with no request from Studio. But it makes a second store next to
   the keychain: a local tool's `env` secrets use the same names
   (`app.plugin-local-tool-config`), so a secret would live in two places, and
   the ones already in the keychain would need moving. It also needs a
   `token-key` in the profile, which
   desktop Studio doesn't make, so a plain API key would stop saving on a fresh
   install.
2. **The shell passes them.** The Rust shell reads the keychain and gives the
   host the values. That is new native code with keychain access for one more
   caller, and it still needs a rule for which values and when.
3. **Studio hands them over when they are needed**, the way a connector's
   secrets reach the host today: `POST /v1/connectors/open` carries the
   connector's own secrets, and the host never reads a secret store
   (`agent-host.connector-routes`).

## Decision

We take option 3. The keychain stays the only place a plugin's secrets are
stored, and Studio stays the only writer.

**The route.** `POST /v1/plugins/secrets` with `{ plugin, secrets }` hands the
host one plugin's secrets: `secrets` maps each name the plugin declares to its
value. The host:

- refuses a request whose `Sec-Fetch-Site` isn't `same-origin` (403
  `secret_from_other_site`) before it reads the body, as the Google secret
  routes do, on top of the launch token every route needs;
- checks the body with no detail in the answer or the log, since it holds
  values: at most 32 secrets, a name by the plugin secret name rule (at most 64
  characters), a value of 1 to 16,384 characters;
- checks its own trust record against the plugin's folder now, as a call does.
  A plugin it doesn't trust gets 403 `plugin_not_trusted`, and the host drops
  any values it held for it;
- refuses a name the plugin's manifest doesn't declare (400
  `secret_not_declared`), so the page can't park values under a plugin;
- builds each name itself, `plugin__<id>__<secret>`, with `pluginSecretName`
  from `@halonicjs/app`. The page never sends a full name, so it can't write
  another plugin's;
- replaces everything it held for that plugin with what was sent. An empty
  `secrets` forgets them;
- answers `{ kept: <count> }`. No answer, error or log line holds a value.

**The store.** The host keeps the values in memory, in one
`PluginSecretValues` for the whole host, never on disk. Its `Secrets` view
answers only `plugin__` names and `null` for anything else, so a workspace's
key, `token-key` or a token can't come out of it even by mistake; the kit still
reads a backend's secrets only through `pluginSecrets(id)` on top of it. The
values go when the host stops, when the plugin is no longer trusted at a call
or a hand-over, or when Studio hands over an empty set.

**Who reads it.** `hostPlugins` gives this view to the backends instead of
`null`. The sign-in host reads a plugin sign-in's client secret from the same
view, through `signInIntegration(raw, { plugin })`, when HAL-8613 wires plugin
sign-ins into the host.

**When Studio hands over.** Right before it asks the host to use them, every
time: before each `POST /v1/plugins/call`, and before a plugin sign-in's
`start` and sign-out. Studio reads only the names `pluginSecretNames` gives for
that plugin from the keychain, and sends the ones it has. Because the hand-over
comes before every use, a secret the person changed or removed counts at the
next call, and a host that restarted gets the values again with no extra step.
A token refresh happens inside a call, and a sign-in's callback comes a few
minutes after its `start`, so both find the values.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Another site's page plants or reads a plugin's secret | Every route needs the launch token, which only Studio has. The route refuses a `Sec-Fetch-Site` other than `same-origin` before it reads the body. No route answers a value |
| The page writes a secret for another plugin, or for a workspace | The page names a plugin and the secret's short name only; the host builds `plugin__<id>__<secret>`, and only for a trusted plugin that declares that secret |
| A plugin's backend reads another plugin's, a workspace's or Halonic's own secret | The host's store holds only what Studio handed over for plugins, never a workspace key, `token-key` or a token, and answers only `plugin__` names. The kit reads a backend's secrets only through `pluginSecrets(id)` |
| A plugin swapped for another with the same id reads the old one's secrets | The host checks its trust record at the hand-over and at every call; a plugin it doesn't trust gets nothing, and its values are dropped. A new version the person trusts again reads the same secrets, as it does from the keychain today |
| A secret leaks through the host's log or an answer | The body's problems aren't described; no answer, error or log line holds a value; the runner never sees a value, as before, because the kit places it only for its declared hosts |
| A copy of the profile gives away plugin secrets | Nothing is written to disk |
| A huge hand-over ties up the host | At most 32 secrets of at most 16,384 characters each, only for a trusted plugin, and the host's body size limit |

**Known limits.**

- The page reads a plugin's secrets from the keychain before each use. It could
  already: the shell lets the page read `plugin__` names, because the page
  writes them. A page that runs someone else's code could read them either way;
  that is the page's own boundary, not this route's.
- The values sit in the host's memory while it runs, as Google's tokens do
  during a call. Someone who can read the host's memory is already you.
- The `halonic` command reads a plugin's secrets from its own environment and
  the profile's secrets file, not from the keychain. This doesn't change that.

## Consequences

- A backend's API keys and a sign-in's client secret work in Studio, with no
  second store and no `token-key` needed for an API key. A sign-in still
  needs the `token-key` to seal its grant, as it does today.
- The page sends a secret to the host, which `agent-host-client.plugins` said
  it never does. That requirement changes: the call itself still carries no
  secret, and only the new hand-over does.
- Each plugin call reads the keychain and makes one more loopback request.
- Liam reviews the route, the store and the Studio side as security changes.

**Pull requests.** One: this record and the threat model rows. Two: the store,
the route, its requirement `agent-host.plugin-secrets`, and the backends
reading it. Three: the shell's route list, the client's hand-over and Studio
calling it before a plugin call. The sign-ins use it in HAL-8613's wiring pull
request.
