# app.doctor-agent-sign-in

- Status: active
- Since: unreleased
- Source: HAL-5649; finding 686 of the code review on HAL-5216; the wording decided on HAL-5231; the agent's settings folder of HAL-6169; an agent with a provider key, HAL-14661

Where the host gives each agent's settings folder, the Harnesses line of `halonic doctor` shall ask each harness with a sign-in of its own about the sign-in in the settings folder of each agent that uses it, because that is the sign-in the agent's runs use. While the harness says no one is signed in there, the line shall be marked as a warning and name that agent and the harness, with the harness's sign-in for that agent's folder. A harness that isn't installed, or isn't in a supported version, shall not be asked, because the line already names that problem. Where the host gives no settings folders, the line shall not ask about the agents' sign-ins. An agent the host names as one whose runs get a provider key Halonic keeps, as `halonic run`'s key services decide it (`harness-host.provider-key-services`) with the agent's placement in each hub it can run in, shall not be asked about, because its runs don't use its own sign-in; where the host can't tell where the agent runs or which access it gets, it shall be asked about as before.

## Examples

- Given Writer uses Codex, Codex 0.9.2 is installed and no one is signed in in Writer's folder,
  then the line is ! and names Writer and Codex, with Codex's sign-in and Writer's folder.
- Given Writer is signed in in its folder and the person isn't signed in in their own,
  then the line names no problem for Writer.
- Given Writer uses Codex and Codex isn't installed,
  then Codex isn't asked about Writer's folder, and the line names only the missing harness.
- Given Writer uses Claude Code, runs in the sandbox, and the workspace's provider claude has the secret `anthropic-key`, so its runs get that key,
  then Writer's folder isn't asked about, and the line names no sign-in for Writer.
- Given an agent whose id can't name a folder,
  then it isn't asked about.
