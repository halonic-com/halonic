# app.revert-parts-three-references

- Status: active
- Since: 0.1.0
- Source: HAL-3278; HAL-3267 engine answer 5 ("one mechanism, three callers")

The revert-parts function shall work the same whichever text is the reference, so Undo this change (reference: the latest version), Accept and Reject on an item page (reference: the assistant's baseline) and Accept and Reject in a run proposal (reference: the run's base) give the same result for the same parts.

## Examples

- Given the assistant changed a routine's schedule, when the person rejects that line, then `schedule` is reverted in the file with the baseline as reference, and the rest of the file stays.
- Given the person accepts that line instead, then `schedule` is reverted in the baseline with the file as reference, and the file is unchanged.
- Given every changed part is reverted, then the file's text is the reference's.
