# studio.workspace-trust-integrations

- Status: active
- Since: unreleased
- Source: the "Runs" line design section 4 (HAL-1873), microcopy 24.1 R4, R9, R11 and R12 (approved by the board on HAL-1949); HAL-3384 part 6, option A (Liam, 21 Nov)

The workspace trust check shall list the workspace's local integrations in their own section, **Integrations (*n*)**, right after Programs, under the line "Code in this workspace that connects to a service. It runs apart from Studio." Each integration shall have its id and the lines **Folder** (its folder, ending in `/`), **Runs**, **Reaches** (each host it names, and each address from a setting as the value and where it comes from, "(from the workspace's settings for *home-station*: *url* · only on your home network)", or "Not set yet, in the workspace's settings for *home-station* · only on your home network") and **Gets secrets** (each secret's name, an arrow and where it may go). The summary shall say "run *1* integration" after what the workspace starts, and "What changed" shall count new and changed integrations as integrations, not addresses. When the check opens, the desktop app shall ask the agent host whether integration code runs in the sandbox on this computer, the same status the plugin check reads. While the host answers, **Runs** shall say "Checking the sandbox on this computer…". In the sandbox it shall say "On its own, with no access to your files or other programs. It can only reach the addresses and use the secrets listed here." Where the sandbox can't start it shall say "Doesn't start on this computer: the sandbox can't start here.", with the reason and the fix in the integration's words under it, and the section shall open by itself; the check shall then offer no checkbox and save no yes, because nothing starts a local integration without the sandbox, also when a yes is saved for plugins. When the host can't say, or gives a reason Studio has no words for, the check shall leave **Runs** out. An answer to an older ask shall be dropped. Only integrations from the workspace's folder shall be in the section; nothing a sheet says about itself shall make one count as built-in.

Using R11's approved first sentence for an integration that can't start is a team decision on approved microcopy (Liam, HAL-3384, 21 Nov), not a new screen. The checkbox (R5), R6 and R12's amber line come when the command line honours a saved yes for local integrations.

## Examples

- Given a workspace with the local integration *home-station* and the computer in the sandbox,
  then the check shows **Integrations (1)**, "Will run 1 integration and list 1 address." and **Runs** "On its own, with no access to your files or other programs. It can only reach the addresses and use the secrets listed here."
- Given Halonic runs in a container, where the sandbox can't start,
  then **Runs** says "Doesn't start on this computer: the sandbox can't start here." with the container reason and fix under it, the section is open and there's no checkbox.
- Given a Windows computer,
  then the reason reads "On Windows, integration code can't run in the sandbox in this version of Halonic." and the fix "Use Halonic inside WSL 2 on this computer."
- Given the host saved a yes for plugins,
  then **Runs** still says the integration doesn't start.
- Given the setting *url* is empty,
  then **Reaches** says "Not set yet, in the workspace's settings for home-station · only on your home network".
- Given a workspace folder holds an integration named *gmail*,
  then it gets the full check, and nothing says built-in.
