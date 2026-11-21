# kit.setup-steps-check

- Status: active
- Since: unreleased
- Source: HAL-13410; first-run-progress (HAL-7986) 3.1 and 8, approved by the board on 19 Nov (HAL-7993): a setup row that checks something can wait, and can have a problem

When a step of the kit's `SetupSteps` that isn't done has a `check` in the `checking` state, its circle shall be outlined in `running` with its number in `running`, and its row shall show a `WaitingLine` in the `row` placement under the hint, naming what the check waits for and counting from the check's `since`, so it shows nothing before 2 seconds. When the check is in the `problem` state, the step's circle shall be outlined in `attention` (amber, never `danger`) with a "!" in `attention` in place of its number, the check's cause shall take the hint's place as the row's meta line and its description for screen readers, and the check's actions shall sit under it as the row's text buttons (`kit.list-row-actions`), in the given order. In both states the row shall keep its chevron and still call `onOpen` when it's clicked or Enter is pressed on it, and the other steps shall be drawn and work as they would without the check. A done step shall draw no check.

## Examples

- Given step 1 "Connect a model" checking "Checking Ollama at localhost:11434…" since 3 seconds ago,
  when the steps render,
  then step 1's circle shows "1" in `running`, and the line "Checking Ollama at localhost:11434…" with "3 s" sits under the hint.
- Given step 1 checking since 1 second ago,
  when the steps render,
  then no waiting line shows yet, and its status region is already in the row.
- Given step 1 with the problem "Ollama isn't answering at localhost:11434. Start Ollama, or add an API key for a cloud model." and the actions Check again, Open Models and Something wrong?,
  when the steps render,
  then step 1's circle is amber with "!", the cause is in the hint's place and is read as the row's description, the three actions follow in that order, and step 2 still opens with a click.
- Given step 1 with a problem,
  when the user clicks Check again,
  then its `onClick` is called and `onOpen` isn't, and a click elsewhere on the row calls `onOpen` with "model".
- Given a done step with a `problem` check,
  when the steps render,
  then it shows its tick and its hint, and no actions.
