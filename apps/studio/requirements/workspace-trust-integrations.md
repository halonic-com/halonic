# studio.workspace-trust-integrations

- Status: active
- Since: unreleased
- Source: the "Runs" line design sections 4 and 7 (HAL-1873), microcopy 24.1 R4, R5, R6, R9 and R12 (approved by the board on HAL-1949); HAL-3384 part 6, option A (Liam, 21 Nov), then option B, built on HAL-15144 once the command line honours the yes (`cli.local-integration-unfenced-yes`); the reason in the shell's words and the changed reason read out, from words check C665 rows 53 and 54 (HAL-16065)

The workspace trust check shall list the workspace's local integrations in their own section, **Integrations (*n*)**, right after Programs, under the line "Code in this workspace that connects to a service. It runs apart from Studio." Each integration shall have its id and the lines **Folder** (its folder, ending in `/`), **Runs**, **Reaches** (each host it names, and each address from a setting as the value and where it comes from, "(from the workspace's settings for *home-station*: *url* · only on your home network)", or "Not set yet, in the workspace's settings for *home-station* · only on your home network") and **Gets secrets** (each secret's name, an arrow and where it may go). The summary shall say "run *1* integration" after what the workspace starts, and shall count each line under **Reaches** as an address; and "What changed" shall count new and changed integrations as integrations, not addresses. When the check opens, the desktop app shall ask the agent host whether integration code runs in the sandbox on this computer, the same status the plugin check reads. While the host answers, **Runs** shall say "Checking the sandbox on this computer…". In the sandbox it shall say "On its own, with no access to your files or other programs. It can only reach the addresses and use the secrets listed here." Where integration code can't run in the sandbox it shall say, in amber with the triangle, "Not in the sandbox on this computer, so it may be able to use your files, programs and sign-ins, and reach other addresses.", for every reason, with the reason and the fix in the integration's words under it; the integration's name shall be followed by "· not in the sandbox" with the triangle, and the section shall open by itself, with the triangle before its heading. Without a yes saved for that reason, the check shall ask for one with the checkbox "I understand plugins and integrations run without the sandbox on this computer" (`workspace.trust-check-unfenced-yes`), and **Trust** shall save the yes through the window's one object for it (`studio.desktop-unfenced-runs`) before it saves trust, and save trust only once the yes is saved. When the host answers that the reason changed, nothing shall be trusted, and the check shall read the status again and ask again, giving the new reason to read out once (`workspace.trust-check-unfenced-yes`) and saying nothing else; when the host couldn't save the yes, nothing shall be trusted, and the check shall say why, in the shell's words for the failure (`errorReasonFor`), never the host's raw answer. With a yes saved for that reason, the check shall say "You allowed plugins and integrations to run without the sandbox on this computer on *9 Nov*, for this reason." under the fix, in place of the checkbox. The yes is the same one the plugin check gives, so one saved there counts here, and the reverse. When the host can't say, gives a reason Studio has no words for, or a yes with no readable day, the check shall leave **Runs** out. An answer to an older ask shall be dropped. Only integrations from the workspace's folder shall be in the section; nothing a sheet says about itself shall make one count as built-in.

An integration not in the sandbox counts as one the workspace runs, because **Trust** there waits for the person's yes to run it without.

## Examples

- Given a workspace with the local integration *home-station* and the computer in the sandbox,
  then the check shows **Integrations (1)**, "Will run 1 integration and list 2 addresses." and **Runs** "On its own, with no access to your files or other programs. It can only reach the addresses and use the secrets listed here."
- Given Halonic runs in a container, where the sandbox can't start, and no yes is saved,
  then **Runs** says "Not in the sandbox on this computer, …" in amber with the container reason and fix under it, the row reads "home-station · not in the sandbox", the section is open, the checkbox shows and the summary reads "Will run 1 integration and list 2 addresses."
- Given the person ticks the box and presses **Trust**,
  then the yes for `container` is saved first, and then the workspace is trusted.
- Given the host answers that the reason changed when the yes is sent,
  then nothing is trusted and the check shows the reason that holds now, with the box unticked.
- Given a Windows computer,
  then the reason reads "On Windows, integration code can't run in the sandbox in this version of Halonic." and the fix "Use Halonic inside WSL 2 on this computer."
- Given the host saved a yes for `container` on 9 Nov, in the plugin check or this one,
  then there's no checkbox, and the line under the fix reads "You allowed plugins and integrations to run without the sandbox on this computer on 9 Nov, for this reason."
- Given the setting *url* is empty,
  then **Reaches** says "Not set yet, in the workspace's settings for home-station · only on your home network".
- Given a workspace folder holds an integration named *gmail*,
  then it gets the full check, and nothing says built-in.
