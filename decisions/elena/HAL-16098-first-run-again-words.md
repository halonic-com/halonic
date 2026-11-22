# Decision: the first run says Run again and pick another model, and says when a run was cancelled

- Task: HAL-16098
- Approval: a team decision under HAL-2282: small wording on the first-run flow the board approved on HAL-7993 (3.4), from flow check C672 #3 (HAL-16091). No new screen or flow. Liam signs at review.
- Kind: user-visible

## What changes

- `runs.run-view.guided-run`: a failed guided run's banner offers **Run again**, as every other failed run and the first run's guide card after **Cancel run** do, instead of **Try again**. The "Still no answer" line says "pick another model", the words of the button it offers, instead of "use another model". The slow line for a model on this computer says "Loading the model. The first run can take a few minutes." instead of "… The first run is slow.". The examples and tests change to the new words; what each test checks is the same.
- `first-run.run`: after **Cancel run**, the first-run bar says "Run cancelled." in the button's place, in a status region so a screen reader hears it, until **Continue** starts another run. One example adds that line, and a new test covers it.

## Why

Before, one action had two names ("Run again" on the guide card, "Try again" on the failed banner) and one choice had two phrases ("use another model" in the line, **Pick another model** on its button). A new user can't tell whether they're the same thing. "Try again" stays where it means "retry what just failed", such as "Couldn't cancel the run. Try again.". After **Cancel run**, the bar changed with no word, so a new user (and a screen reader) had no sign that the cancel worked. "The first run is slow" didn't say how slow. The no-answer line isn't changed to name **Cancel run**: the line belongs to the runs feature and doesn't know whether the engine can cancel, and the bar's button is on screen next to it the whole time.

## Covers

- runs.run-view.guided-run
- first-run.run
