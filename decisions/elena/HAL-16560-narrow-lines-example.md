# Decision: the narrow trust check example names no gap between a label and its value

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16560 (Sofia's C716 re-check, HAL-16554)
- Kind: internal

The example in `workspace.trust-check-narrow-lines` said a value sits 4 px below its label. The
screen has no gap there: below 24rem a label sits directly over its value, and 8 px separate the
value from the next label. Sofia's re-check found that this is what the design wants. The example
now says "`/usr/local/bin/node` directly under it, and 8 px above the next label". The main
sentence, the screen and the tests stay as they are.

## Covers

- workspace.trust-check-narrow-lines
