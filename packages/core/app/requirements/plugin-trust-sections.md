# app.plugin-trust-sections

- Status: active
- Since: unreleased
- Source: HAL-1739 design, section 5 (the trust check for a plugin), approved by the board; HAL-1741 (P8): `halonic plugin add` and Studio's trust check show the same sections, in the same order, under the same headings, read from one shared model; HAL-12384: the tools line, so the CLI no longer says a reading tool runs without asking

The app shall give the sections of a plugin's trust check from its trust content, in this order and under these headings: "Tools for agents", "Programs", "Secrets", "Addresses" and "In Studio". A section shall be given only when it has something in it: a tool, a local program, a secret, a host, or settings, a command, a card or a panel in the plugin's `ui`. Under "Tools for agents" the first line shall be "Agents can use these through a connector. Each one asks a person first unless you change that.", for every tool whatever its risk, because a connector counts a plugin's tool as changing things until the connector file's `read` list names it. Every host that shows a plugin's trust check shall take its sections, their order, their headings and that line from these.

The app shall also give the files of the plugin's folder that its fingerprint covers, for the check to list under the plugin's folder: all of them when there are at most eleven, otherwise the first ten by path and the number of files after them, so a host can say "and N more" and never "and 1 more". They sit under the headings "Folder" for where the plugin is on disk and "Files" for the list, since a program's files are listed as well as a backend's. The manifest `plugin.yaml` is not listed. A host shall escape each path as other text from the workspace before it shows it.

## Examples

- Given the weather plugin with a backend, the local tool `files` and a `ui` with a setting and a command,
  when its sections are read,
  then they are tools, programs, secrets, addresses and In Studio, in that order.
- Given a plugin with only a backend tool that reads, no secrets, no hosts and no `ui`,
  when its sections are read,
  then the only section is tools.
- Given a plugin folder with `plugin.yaml` and `backend/index.js`,
  when its files are read,
  then the only file shown is `backend/index.js` and there are no more.
- Given a plugin folder with `plugin.yaml` and thirteen other files,
  when its files are read,
  then the first ten by path are shown and three more.
- Given a plugin folder with `plugin.yaml` and exactly ten other files,
  when its files are read,
  then all ten are shown and there are no more.
- Given a plugin folder with `plugin.yaml` and eleven other files,
  when its files are read,
  then all eleven are shown and there are no more, because "and 1 more" would take the same row.
- Given a plugin folder with `plugin.yaml` and twelve other files,
  when its files are read,
  then the first ten by path are shown and two more.
- Given a plugin folder whose path and a file name hold a direction override (U+202E) or an escape character (U+001B),
  when Studio shows the folder and the files,
  then each hidden character reads as a marker such as `⟦U+202E⟧` and none acts on the text around it.
