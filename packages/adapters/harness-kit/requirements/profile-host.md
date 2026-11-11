# harness-kit.profile-host

- Status: active
- Since: 0.1.0
- Source: HAL-6209; HAL-6169

When the harness profile builder asks the host about an agent, the harness kit shall answer from what the engine asks with and from Halonic's data folder:

- The agent's file shall be the one the call read, as the engine passes it: its working folder, or none for the default, and its allowed sites, or none. How its harness starts shall come from the host's own lookup.
- The settings folder shall be the agent's folder for its harness, as the profile's workspace folders name it, made and private to the user. A harness without a sign-in folder variable shall get none.
- Each temp folder shall be new, empty and private to the user, made in the host's temp folder and given at its real place.
- A sandbox the host wraps shall remove the temp folder the host made for a session once the session has closed, also when it is closed twice, and at once when the session fails to open. It shall never remove a temp folder the host didn't make. A folder that can't be removed shall be reported, and closing shall still succeed.

## Examples

- Given an agent in Claude Code,
  when the host is asked for its settings folder,
  then it is `harness-settings/writer/claude-code` in the workspace's folder, made, and private.
- Given an agent in a harness without a sign-in,
  when the host is asked for its settings folder,
  then it gets none, and nothing is made.
- Given a session opened with a temp folder from the host,
  when the session closes,
  then the folder is gone.
- Given a session opened with a temp folder the host didn't make,
  when the session closes,
  then the folder is still there.
