# studio.workspace-files-outside

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 4.6; HAL-10534, HAL-11169

The Studio shall tell a listener of the Files host which files it took in from outside Halonic after each batch watched, deleted ones included and held ones left out, and tell it nothing when no file was taken in. It shall hold the files a save reported as changed outside Halonic, as `changed` or, when one is gone, `deleted`, the way it holds the ones the watch reported, and tell a subscriber.

## Examples

- Given the folder reports a batch of two files and both are taken in, then a listener is told both paths once.
- Given the only file of a batch has unsaved changes, then no listener is told.
- Given a save left `a.md` alone because it changed, and `b.md` because it is gone, then `a.md` is held as `changed`, `b.md` as `deleted` and a subscriber is told once.
