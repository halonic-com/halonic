# app.review-assistant-writes

- Status: active
- Since: 0.1.0
- Source: AI changes 1.1 and 1.10 (HAL-3228); Liam's engine answer, point 1 (HAL-3267); save model 1.7 (`DefinitionStore.write` with `expected`, HAL-3247); HAL-3277

When the chat assistant writes a file, the review service shall write it through `DefinitionStore.write` with `expected` set to the digest of the text the model last read in that chat, and, on that file's first write, keep the text from before the write as the file's baseline (none for a new file). It shall record the card that wrote it and the file's digest after the write. A later write shall keep the baseline, and a write that makes the file its baseline again shall remove the record. If the file isn't what the model read, it shall write nothing, change no record and give the current text. If the file changed outside Halonic since its record was made, it shall write nothing and hold the file for Compare. A write from another card shall take the file over and name the card it replaced.

## Examples

- Given `agents/clerk.agent.yaml` with `model: fast` and no record,
  when the assistant in chat `c1`, card `k1`, writes `model: smart` with the digest of what it read,
  then the file holds `model: smart`, its baseline is the text with `model: fast`, and the record names `c1`/`k1`.
- Given that record,
  when the assistant writes the file again,
  then the baseline still has `model: fast`.
- Given the person changed the file after the model read it,
  when the assistant writes,
  then nothing is written, there is no record and the model gets the current text.
- Given a record and a file changed by another editor since,
  when the assistant writes,
  then nothing is written and the file is held for Compare.
- Given no `agents/clerk.agent.yaml`,
  when the assistant writes it,
  then the baseline is none.
- Given the file has a record from card `k1`,
  when card `k7` of chat `c2` writes it,
  then the record names `k7` and `k1` is reported as replaced.
