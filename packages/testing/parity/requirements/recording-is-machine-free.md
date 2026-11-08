# parity.recording-is-machine-free

- Status: active
- Since: 0.1.0
- Source: HAL-108

The recorder shall replace the scratch folder in every recorded message and output with `<workspace>`, and write each recording as two-space JSON with a final newline.

If recorded output carries a time or a run ID, then the recorder shall refuse to write it, because it could not be compared without a fixed clock and fixed IDs.

## Examples

- Given the output "error <scratch>/models.yaml: bad", when it is recorded, then it reads "error <workspace>/models.yaml: bad".
- Given output that holds "2026-11-07T10:00", when it is recorded, then recording fails.
- Given output that holds "test_mw6zmn5u_8202b972", when it is recorded, then recording fails.
