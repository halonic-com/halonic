# watch-kit.digest-watch

- Status: active
- Since: 0.1.0
- Source: HAL-5766, HAL-3335

While a digest watch is open, it shall gather the names its event source gives until the source has been quiet for `quietMs`, then read every file at or under those names once, compare each file's digest with the one it last saw, and report the files whose text differs as one batch sorted by path, as `ports.definition-store-watch` says. A name of `""` shall make it check every file. It shall ignore names of private entries and the store's scratch files, and treat a path the store refuses as having no file. It shall leave out a file that holds what the store marked as its own change in progress. When the event source fails, or reading a batch fails, it shall tell the listener once and report nothing more.

## Examples

- Given a watch on `a.yaml` and `b/c.yaml`,
  when `b/c.yaml` changes and the source names `""`,
  then the listener gets `b/c.yaml changed`.
- Given a watch where the store marked `a.yaml` as its own change to `2`,
  when `a.yaml` becomes `2` and `b.yaml` changes,
  then the batch holds only `b.yaml changed`.
