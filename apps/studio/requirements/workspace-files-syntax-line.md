# studio.workspace-files-syntax-line

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.5 ("can't be read" strip); HAL-10534, HAL-11196

The Files host shall say on which line a YAML file stops being valid YAML, so the file tab can say the file can't be read, and shall say nothing for a file that reads as YAML, for a file that isn't YAML, for a file that isn't there, for a text over the YAML size limit (a size problem, not a syntax one) and for a file whose saving is paused because it changed outside Halonic (the folder's text is not what the editor shows).

## Examples

- Given `hubs/p/hub.yaml` holds `id: [unclosed`, then the line of the syntax error is returned.
- Given `hubs/p/hub.yaml` holds `id: p`, then the answer is `null`.
- Given `notes.md` holds `id: [unclosed`, then the answer is `null`.
- Given a file that isn't there, then the answer is `null`.
- Given the file holds a YAML text longer than the limit, then the answer is `null`.
- Given the file's saving is paused, then the answer is `null`.
