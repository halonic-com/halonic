# fs-node.write-is-whole-or-nothing

- Status: active
- Since: 0.1.0
- Source: save model 1.7 (HAL-1102), routing note task 3 (HAL-3236), HAL-3247

When the folder definition store writes a file, it shall write the text to a temporary file in the same folder and rename that over the file, so another program reads the old text or the new, never half of it. The replaced file shall keep its permissions. A write that fails shall leave the file as it was and remove its temporary file, and `list()` shall never show a temporary file.

## Examples

- Given a folder at `hubs/a.yaml`,
  when `hubs/a.yaml` is written,
  then the write fails, the folder is as it was and `hubs` holds no temporary file.
- Given `run.sh` with permissions 755,
  when it is written,
  then it still has permissions 755.
