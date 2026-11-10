# fs-node.watch-folder

- Status: active
- Since: 0.1.0
- Source: save model 6.1 (HAL-1102), routing note task 3 (HAL-3236), HAL-3247

While a watch is open, the folder definition store shall hear the workspace folder through `node:fs.watch`, recursive, gather the events until the folder has been quiet for a short pause (100 ms by default), then read every path they name once and report it as `ports.definition-store-watch` says. It shall keep the digest of every file it has seen, so it can tell its own writes, which it marks before and after each write and remove, from changes made outside. An event that names no entry shall make it check every file. Its temporary write files shall never be reported.

## Examples

- Given a watch on a folder,
  when another program writes `hubs/a/hub.yaml`,
  then the listener gets `hubs/a/hub.yaml changed`.
- Given a watch,
  when `hubs/a` with two files is deleted and `hubs/b/hub.yaml` arrives,
  then one batch holds both files of `hubs/a` as `removed` and `hubs/b/hub.yaml` as `changed`.
