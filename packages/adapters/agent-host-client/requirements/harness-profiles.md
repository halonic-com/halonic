# agent-host-client.harness-profiles

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `agent-host.profile-route`

The profile builder stand-in shall ask the host's `POST /v1/harnesses/profile` for a harness call's sandbox profile, and give the engine the profile and its denied groups as the host answered them. It shall send only the workspace it was made for, the agent's ids, harness, working folder, allowed sites and proposal folder, and the bridge's id, and shall never send a bridge's token, a data folder or a variable. It shall fail with the host's kind and reason when the host refuses (`profile_refused`, `unknown_workspace`, ...), shall fail before asking when the bridge isn't open in the host, and shall fail on an answer that isn't a profile.

## Examples

- Given an open bridge and a host that builds the profile,
  when the engine asks for the profile of the agent `writer`,
  then the host gets the workspace, the agent's fields and the bridge's id, and the engine gets the host's profile.
- Given a host that refuses the working folder,
  when the engine asks,
  then the call fails with the kind `profile_refused` and the host's reason.
- Given a bridge the host never opened,
  when the engine asks,
  then the call fails and the host isn't asked.
- Given an answer without a working folder,
  when the engine asks,
  then the call fails.
