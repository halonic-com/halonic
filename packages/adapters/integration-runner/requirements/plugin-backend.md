# integration-runner.plugin-backend

- Status: active
- Since: 0.1.0
- Source: HAL-1737 (P4); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.1 and 3; the I5 design on HAL-958, 3.5

When Halonic loads a plugin's backend, it shall treat it as a local integration: its sheet shall be the manifest's `backend` with the plugin's id, version and SDK, and the sheet that is checked and approved shall be that one, from the manifest that was read and trusted. It shall check the sheet and the person's choices without loading the backend's code, refuse a sheet that declares `tokens` so that no token value enters the runner, refuse the folder when a link in it leads out of it, and only then start one runner through the caller's start, which is the plugin's trust check and then the start gate. It shall give the backend's host only the hosts and secrets its sheet declares and the plugin's plain setting values, and offer its tools only when the runner's declaration matches the sheet. Before every runner start, the first and each one after an idle stop, it shall check that the plugin's folder holds exactly the files the person's trust covered, each with the hash that was checked, and refuse the start naming the paths that differ (added, missing or changed), never their contents. Only `loadPluginBackend` shall load a local integration as a plugin's backend; the exported `loadLocalIntegration` options have no way to ask for a plugin's secrets. A plugin without a backend shall give a `no-backend` problem and start nothing. There shall be no in-process path for a plugin's backend.

## Examples

- Given a plugin with a backend that declares a host, a secret and a tool,
  when it is loaded,
  then one runner starts with the host's client, the tool's name and the secret's forms, and the tool is offered as the runner declared it.
- Given a plugin setting `units`,
  then the host's settings hold `units`, and no secret's value.
- Given a plugin whose backend declares `tokens`,
  then loading gives `tokens-not-allowed`, and no runner starts.
- Given a plugin with only local tools,
  then loading gives `no-backend`, and no runner starts.
- Given a file in the plugin's folder whose bytes changed since the trust check, or one added or missing,
  then the start is refused with that path, at the first start and at a restart after an idle stop, and no runner starts.
- Given a link in the plugin's folder that leads out of it,
  then loading gives `link-out-of-folder`, and no runner starts.
- Given a runner whose code declares a tool with another risk than the manifest,
  then the runner is stopped and no tool is offered.
- Given a start that throws because the person never trusted the plugin,
  then loading throws that and offers nothing.
- Given the loaded backend's host,
  then a request to an address its sheet doesn't declare is refused.
- Given the loaded backend's host and a request to a declared host that asks for a declared secret,
  then the host's client places the secret's value, and the service sees it.
- Given a service that echoes the secret back in its response,
  then the response the host gives the code doesn't hold the secret's value.
- Given a request to a host the secret isn't declared for,
  then nothing is sent.
- Given the runner's start,
  then the secret's value is only in the filter forms, not in the client, the settings or the tool names.
