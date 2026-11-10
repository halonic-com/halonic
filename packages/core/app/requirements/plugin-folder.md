# app.plugin-folder

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, section 3 and decisions D3 and D5, approved by Liam on HAL-4038 (2,000 files and folders and 50 MB, stopping before any byte is read; the folder named exactly as the id); Liam's review on HAL-4352 (count the bytes read, checks before hashing); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.5 and 3

The app shall read a plugin folder through the `FolderReader` port, hash every file's bytes and parse the manifest from the same bytes it hashed. Before reading any bytes, it shall refuse a folder with more than 2,000 files and folders, or more than 50 MB of files, saying that a `.git` folder inside it counts too, and a folder with a link or a special file anywhere in it. It shall read the manifest and run the checks below before reading any other file. It shall count the bytes it reads and stop once they pass 50 MB, so a file that grew after the folder was listed is refused too. It shall refuse a folder without exactly one of `plugin.yaml` and `integration.yaml`, and read an `integration.yaml` as a plugin with only a backend. It shall refuse a plugin whose id isn't exactly its folder's name, whose `sdk` isn't the `Integration` port version, whose backend declares `tokens` (with the ADR's sentence), or whose backend entry or local tool script isn't a file in the folder. Each problem shall name the file and, for the manifest, where in it.

## Examples

- Given a plugin folder `weather` with `plugin.yaml`, `backend/index.js` and a binary file,
  when it is read,
  then it gives the plugin, the folder's real path, and the SHA-256 of each file, sorted by path, and `plugin.yaml` is read once.
- Given a plugin folder with a link `assets/latest`,
  when it is read,
  then it is refused with a `link` problem for `assets/latest`, and no file is read.
- Given a plugin folder whose `.git` folder holds 2,000 files,
  when it is read,
  then it is refused before any file is read, and the message says a `.git` folder counts too.
- Given the weather plugin in a folder named `weather-old`,
  when it is read,
  then it is refused with a `folder-name` problem at `id`, and only `plugin.yaml` was read.
- Given an `integration.yaml` with `kit: 2`,
  when it is read,
  then the problem is in `integration.yaml` at `kit`.
- Given a file that grew past 50 MB after the folder was listed,
  when it is read,
  then the folder is refused as too large, and no file after it is read.
