# fs-web.open-local-folder

- Status: active
- Since: 0.1.0
- Source: HAL-10 migration checklist P3, HAL-3335, HAL-5766

Where the browser offers folder access (`showDirectoryPicker`), the browser folder store shall open the folder the person picks with read and write access, report its location as `browser:<folder name>`, and list, read, write and remove files in it as the `DefinitionStore` port says, leaving out the browser's pending copies (`*.crswap`). When the person cancels the picker, it shall open nothing and give `cancelled`, not an error. Where the browser has no `showDirectoryPicker`, it shall give `not-supported` without showing anything. A write with `expected` shall check the file again right before the browser puts the write in place, and when the file changed from outside meanwhile, it shall drop the write and give `changed-on-disk`.

## Examples

- Given Chrome and the person picks folder "acme", when the workspace opens,
  then its location is `browser:acme` and `workspace.yaml` is read from that folder.
- Given the person cancels the picker, when the workspace opens,
  then the result is `cancelled` and no error is shown.
- Given Firefox (no `showDirectoryPicker`), when a folder is to be opened,
  then the result is `not-supported`.
- Given `a.yaml` holding `1` and a write of `2` expecting `1`,
  when another program writes `3` while the write is pending,
  then the write gives `changed-on-disk` with `3`, and `a.yaml` holds `3`.
