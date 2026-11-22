# agent-host.built-profile-sessions

- Status: active
- Since: unreleased
- Source: HAL-16341 (agent host and remote executor checks); `agent-host.profile-route`, threat model 4.6

When a caller asks to open a sandbox session, the agent host shall open it only for a profile it built on `POST /v1/harnesses/profile` whose session has not opened yet, with every field as built except that the harness's own variables may be added to `env`, and shall answer any other profile with 403 `profile_not_built` without opening anything. A host without a profile folder builds no profile, so it shall open no session. When a caller names an instructions folder in a profile request, the agent host shall build the profile only when the folder is one it made on `POST /v1/harnesses/instructions` and has not removed, and shall answer any other folder with 404 `unknown_instructions`.

Rationale: the fence is the host's to set (threat model 4.6). The caller over loopback names what to run and where, the host decides what the program may read, write and reach.

## Examples

- Given a profile the host built,
  when the caller opens a session with it and the harness's variables added,
  then the session opens, and a second open with the same profile is 403 `profile_not_built`.
- Given a profile the host built,
  when the caller opens a session with another working folder, fewer denied paths, more read-only paths, a settings folder, other sites, a longer time limit or the key store allowed,
  then the answer is 403 `profile_not_built`, nothing opens, and the profile as built still opens afterwards.
- Given a built profile whose `PATH` the caller changed, left out, or added again as `Path`,
  then it is not the built profile.
- Given a host without a profile folder,
  then every open is 403.
- Given an instructions folder the host made,
  when the caller asks for a profile with it,
  then the profile reads it; with a folder elsewhere in the data folder, or one the host has removed, the answer is 404 `unknown_instructions`.
