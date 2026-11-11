# connector-stdio-sandbox.local-tool-profile

- Status: active
- Since: 0.1.0
- Source: HAL-1738 (plugins P5), plan rules 4 and 5; plugins ADR sections 1.2 and 3; Liam's conditions on HAL-4783: compare field by field against the profile built from the same inputs, name the field and never its value, and let nothing log or serialise the profile's secrets

The `localToolLaunch` function shall build a local tool's profile and command only from the place the host set up, the tool's stdio config, its pin and the secret values Halonic read. The environment shall hold only the tool's settings, its secrets and the variables Halonic sets (`PATH`, and the home and temp folders inside the session), with Halonic's variables winning over a setting of the same name and the secrets last. A pinned package shall start as the pinned launcher starts it on this computer, with nothing inherited but `PATH`, and its registry's host (and for the public PyPI, `files.pythonhosted.org`) shall join the manifest's sites. The network shall be the bridge and those sites only. Before each start, the connector shall check the launch with `checkPinnedLaunch`, read every secret, rebuild the profile from the same place, and refuse to start when the session's profile differs, naming each field that differs (`env` by variable name) and never a value. No refusal, event or report the connector makes shall carry a value from the profile's environment.

## Examples

- Given a session whose profile allows every site and holds another value for `NOTES_TOKEN`,
  when the connector lists its tools,
  then it throws naming `env.NOTES_TOKEN` and `network`, without either value, and `session.start` is never called.
- Given a pinned npm package whose registry lists the pinned version,
  when the connector starts,
  then the registry was asked once and the session started the pinned launcher's command.
- Given a program that prints its secret to standard error,
  when its tools are listed, a tool fails, the sandbox blocks an access and the session ends,
  then no error, event or report holds the secret.
