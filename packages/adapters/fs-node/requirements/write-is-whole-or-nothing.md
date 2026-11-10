# fs-node.write-is-whole-or-nothing

- Status: active
- Since: 0.1.0
- Source: save model 1.7 (HAL-1102), routing note task 3 (HAL-3236), HAL-3247, HAL-3355

When the folder definition store writes a file, it shall write the text to a temporary file in the same folder and rename that over the file, so another program reads the old text or the new, never half of it. The replaced file shall keep its permissions. A write that fails shall leave the file as it was and remove its temporary file, and `list()` shall never show a temporary file. On Windows, when the rename fails because another program has the file open for a moment (`EPERM`, `EBUSY` or `EACCES`), the store shall try it again for about a second before it gives up.

## Examples

- Given a folder at `hubs/a.yaml`,
  when `hubs/a.yaml` is written,
  then the write fails, the folder is as it was and `hubs` holds no temporary file.
- Given `run.sh` with permissions 755,
  when it is written,
  then it still has permissions 755.
- Given a program that rewrites `review.yaml` again and again,
  when another reads it at the same time,
  then every read gives the old text or the new one in full.
- Given Windows and a `review.yaml` that a virus scanner holds open for a moment,
  when it is written,
  then the rename is tried again and the write succeeds once the scanner lets go.
