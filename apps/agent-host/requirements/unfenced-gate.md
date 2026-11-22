# agent-host.unfenced-gate

- Status: active
- Since: unreleased
- Source: HAL-13195 (Studio's agent host gets an unfenced session; Liam planned it after HAL-13090)

When the agent host is asked to open a session without the sandbox for an agent, it shall first check, on its own records and never on the page's word, that a person let that agent out, and refuse otherwise, in this order:

1. a folder the launcher didn't name, compared by real path (`404 unknown_workspace`), or an agent that workspace hasn't (`404 unknown_agent`). The host loads the workspace and reads the agent's file from disk itself;
2. an agent that the person's trust record for the workspace doesn't list exactly as its file is now, by its harness, sites, working folder and `asks` (`403 workspace_not_trusted`). It shall fail closed: a trust record it can't read, a host with no profile folder (so no trust record at all), and an agent in Halonic's own loop, which starts no program, each get this refusal, even when a record names that agent;
3. an agent whose file, as it is now byte for byte, has no "On this computer" choice in the person's profile, read with the same `AgentPlacement` as the CLI (`403 not_on_this_computer`);
4. a profile the host didn't build for that agent in that workspace, one a session already opened with, one that differs from the built one in any field but its environment, or one built with an instructions folder the host's instruction route didn't make, or that holds other texts than the agent's file and the workspace's own skill files on disk make, by pin (`403 profile_not_built`). The instructions folder becomes Claude Code's `--plugin-dir` (and Codex's skills folder). A plugin's hooks, and a skill's frontmatter `hooks:` and `` !`command` `` lines, run without asking anyone, and the page sends the folder's texts, so only a folder the host wrote itself, holding only the workspace's own `AGENTS.md` text and `SKILL.md` files, passes. A selected skill with no file in the workspace passes no folder;
5. instructions that the person's instruction trust record for the agent doesn't trust as they are now, by the same pin and key as the engine's check (`engine.harness-instructions-trust`), read from `instruction-trust` in the user's profile, the folder Studio's trust dialog writes (`403 instructions_not_trusted`). Neither the trust record nor the "On this computer" choice covers the skills' texts, and the page's own instruction check counts for nothing here, so a skill changed on disk since the person trusted it, by a fenced agent or a `git pull`, doesn't pass. It shall fail closed: a record it can't read and a host with no profile folder each get this refusal. A profile built with no instructions folder has nothing to trust and needs no record.

The gate shall pass the built profile with the agent and the instructions folder it was built for, which the session keeps, so the run's start refuses another agent or folder and checks the environment (`agent-host.unfenced-start`).

The gate shall read the agent's file once: the bytes the person's choice is checked on are the bytes its parsed form, which the trust check reads, came from, and the skill texts its instructions are checked on come from the same load of the workspace. A file that changes between the two reads is refused as an unknown agent. The profile's working folder and sites come from the page when it is built, but the builder reads the working folder from the agent's file, and the trust check reads the sites from the file on disk, so neither is the page's choice.

The session passes no workspace connector or integration program to the run. The request names none, and a profile that carries anything the host didn't build, a connector's program included, gets `profile_not_built`. The only program a run in the session starts is the harness the host's own adapter starts, with the bridge's MCP servers alone, the agent's own settings alone and no plugin folder but the host's own instructions folder, so the working folder's MCP servers (`.mcp.json`, `.codex/config.toml`) and hooks, and a plugin folder the page names, don't load (`harness-claude-code.command`, `harness-codex.config`, `agent-host.unfenced-start`). A workspace `stdio` connector starts only through the host's connector routes, in its own sandbox session and after its own check against the same trust record (`agent-host.connector-routes`), and the run reaches it only as a tool on its bridge, each call checked there.

The host's profile builder shall keep each profile it builds, with the workspace and the agent it is for, only until a session opens with it. A caller shall be able to ask, right before it opens, whether the profile still waits, so that of two requests with one profile only the first opens.

## Examples

- Given the coder, trusted and set to "On this computer", and a profile the host built for it,
  when the gate checks a request for it,
  then it passes with the built profile.
- Given the coder set to "On this computer" but missing from the trust record,
  when the gate checks a request for it,
  then it refuses with `workspace_not_trusted`.
- Given the coder trusted but never set to "On this computer", or its file changed since the choice, even by whitespace,
  when the gate checks a request for it,
  then it refuses with `not_on_this_computer`.
- Given a profile the host didn't build, built for another agent, changed outside its environment, or already opened,
  when the gate checks a request with it,
  then it refuses with `profile_not_built`.
- Given the coder set to "On this computer" and a trust record the host can't read, or a host with no profile folder,
  when the gate checks a request for it,
  then it refuses with `workspace_not_trusted`.
- Given an agent in Halonic's own loop set to "On this computer", whose name a trust record lists,
  when the gate checks a request for it,
  then it refuses with `workspace_not_trusted`.
- Given a profile the host built for the coder, with a connector's program added to it,
  when the gate checks a request with it,
  then it refuses with `profile_not_built`, and no connector reaches the run.
- Given a profile the host built for the coder with an instructions folder its instruction route didn't make, such as a folder holding `hooks/hooks.json`,
  when the gate checks a request with it,
  then it refuses with `profile_not_built`.
- Given a profile the host built for the coder with an instructions folder its instruction route made from texts the page sent, where a skill's text isn't the workspace's `SKILL.md`, such as one that adds `hooks:`, or a selected skill the workspace has no file for,
  when the gate checks a request with it,
  then it refuses with `profile_not_built`.
- Given the coder, trusted and set to "On this computer", whose instructions the person never trusted, or whose skill gained `hooks:` on disk after they did,
  when the gate checks a request with an instructions folder the host made from the workspace's files,
  then it refuses with `instructions_not_trusted`.
- Given the coder and an instruction trust record the host can't read, or a host with no profile folder,
  when the gate checks a request with an instructions folder,
  then it refuses with `instructions_not_trusted`.
- Given a run that names an instructions folder the host didn't build the session with,
  when it starts in the session the gate let out,
  then the host refuses it (`agent-host.unfenced-start`).
- Given a folder the launcher didn't name, or an agent the workspace hasn't,
  when the gate checks a request for it,
  then it refuses with `unknown_workspace` or `unknown_agent`.
