# cli.commands.plugin.add

- Status: active
- Since: unreleased
- Source: HAL-1736 (P3, plugin add); cli-output 3.6, approved on HAL-2123; without In Studio since HAL-6417; Studio's line that every tool asks first since HAL-12384; the line naming what was left out since HAL-13713

The `halonic plugin add <folder>` command shall copy the plugin in the folder into the profile's plugins folder, as a folder named by the plugin's id, never into a workspace, and then show the plugin's trust check and ask whether to trust it and turn it on. The check shall have Studio's sections in Studio's order and under Studio's headings: Tools for agents, with Studio's first line that each tool asks a person first unless you change that, then the tools under Reads, Changes things and Sends, Programs, Secrets with the one address each goes to, and Addresses, each shown only when it has something in it, but not In Studio, because 0.1 has no Studio to draw a plugin's settings, commands, cards or panel. Then comes the line that plugin code runs apart from the rest of Halonic and that Halonic doesn't check what the plugin does with what it's given. In a terminal, the full fingerprint follows under the heading Fingerprint, above the question, so it can be passed to `--fingerprint` after a review. Answering yes shall trust exactly the fingerprint of what was copied, say that the plugin is added and on, and exit 0. Answering no, or Enter, shall leave the plugin added but off, say how to trust it, and exit 3. With no terminal, or `CI` set, and without `--yes --fingerprint`, it shall do the same on stderr, with the check, the reason and the fix, and the bare fingerprint last on stdout. With `--yes` and the `--fingerprint` of what was copied, it shall ask nothing. With `--yes` alone it shall refuse before copying anything, and with a `--fingerprint` that is not the copy's it shall leave the plugin added but off and exit 3. The copy shall leave out what `app.plugin-add` leaves out, and when it left out paths the sandbox denies, such as `.ssh`, one line ahead of the check shall name them. A folder that is, holds or is inside the profile folder or the workspace's `.studio` data in the folder it runs in, or is inside any workspace's `.studio`, also through a link, shall be refused before anything is read, saying a plugin can't be added from Halonic's own data, or from a folder that holds it. A folder that can't be read or checked, a plugin that is already added, a path that isn't a folder ("there's no folder ./nope" when nothing is there), or a link or file that would escape the plugin's folder shall be refused with its reason, before anything is written to the plugins folder. A reason about one field of the manifest shall start with that field's place, such as `backend.tools[0].risk:` or `id:`.

## Examples

- Given a folder with a valid plugin Weather,
  when `halonic plugin add ./weather` is run in a terminal and the answer is y,
  then the check is shown, the plugin is in the plugins folder and trusted, and it says "Added Weather 1.2.0. It's on." and exits 0.
- Given the same folder and the answer n,
  when `halonic plugin add ./weather` is run,
  then Weather is in the plugins folder and not trusted, it says "Weather is added but off. Nothing from it runs until you trust it: halonic trust --plugin weather" and exits 3.
- Given the same folder and no terminal,
  when `halonic plugin add ./weather` is run,
  then the plugin is added but off, stderr has the check and the two lines that say there's no terminal, the last stdout line is the fingerprint, and it exits 3.
- Given a plugin already added with the id weather,
  when `halonic plugin add ./other-weather` is run for a plugin with the same id,
  then it says weather is already added and to remove it first with `halonic plugin remove weather`, writes nothing and exits 5.
- Given a folder with a link to a file outside it,
  when it is added,
  then it is refused with the reason, nothing is written to the plugins folder, and it exits 2.
- Given a folder with a valid plugin and `.ssh/id_ed25519` and `.aws/credentials` in it,
  when it is added,
  then the copy has neither folder, and one line ahead of the check says "Not copied, because they're private: .aws, .ssh".
- Given the profile folder in `~/.halonic`,
  when `halonic plugin add ~` or `halonic plugin add ~/.halonic` is run, or a link to a folder inside it is added,
  then it says "Couldn't add the plugin: a plugin can't be added from Halonic's own data, or from a folder that holds it.", copies nothing and exits 2.
