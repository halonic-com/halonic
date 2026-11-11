# contracts.plugin-folder-writer

- Status: active
- Since: 0.1.0
- Source: HAL-1736 (plugins P3) plan, step 3; `PluginFolderWriter` port v1. What a plugin's trust covers is what was placed, so `place` writes whole or not at all and nothing is written or removed through a link

Where an adapter implements `PluginFolderWriter`, `place` shall write every file, with its exact bytes, under the folder named by the id, and give `placed`. With `replace`, it shall put the new folder in place of a real folder with exactly that id and leave none of the old files. It shall give `taken` and change nothing when the id is already there and isn't replaced, when an entry has the id in another case (compared with `segmentAsOpened`), and when the entry with the id is a file or a link. `remove` shall remove a plugin folder and everything in it, remove a link itself and never what it points to, and do nothing when there is no entry with exactly the id, even when one has it in another case. Both methods shall refuse an unsafe id, and `place` an unsafe file path, two paths that are the same file on a disk that ignores case, or a path that is a file and also a folder above another file, with a `RangeError`, writing nothing.

## Examples

- Given an empty plugins folder,
  when `weather` is placed with `plugin.yaml` and `backend/index.js`,
  then the reader lists `weather`, `weather/backend`, `weather/backend/index.js` and `weather/plugin.yaml`.
- Given a folder `Weather`,
  when `weather` is placed, with or without replace,
  then it gives `taken` and `Weather` is unchanged.
- Given a folder `Weather`,
  when `weather` is removed,
  then `Weather` is unchanged.
- Given a link `weather` to the folder `keep`,
  when `weather` is removed,
  then the link is gone and `keep` and its files are unchanged.
- Given files with the path `../escape.js`,
  when they are placed,
  then it is refused with a `RangeError` and the plugins folder stays empty.
