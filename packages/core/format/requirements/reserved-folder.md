# format.reserved-folder

- Status: active
- Since: 0.1.0
- Source: HAL-113, proposal 12 V1 ([HAL-69](/HAL/issues/HAL-69#document-source-record)), plan 15.1

The format shall reserve a `.halonic/` folder at the workspace root and inside each `hubs/<hub>/` for Halonic's own data, and the loader shall skip every file in it without a warning (phase 2 loader: this requirement is its input).

## Examples

- Given `hubs/billing/.halonic/source.json`, when `isReservedPath` checks it, then it is reserved.
- Given `hubs/billing/library/.halonic/x.yaml`, when it is checked, then it is not reserved: only the hub folder's own `.halonic/` is.
- Given `.Halonic./staging/x.yaml` or `hubs/billing/.HALONIC/source.json`, when it is checked, then it is reserved: names compare the way Windows and macOS open them, with case folded, trailing dots and spaces removed and the code points HFS+ ignores removed (HAL-3968).
