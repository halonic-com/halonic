# app.change-sentences

- Status: active
- Since: unreleased
- Source: HAL-12856, so What changed shows the sentences "Instructions edited: 1 sentence changed" counts, not the whole text

The `sentenceChanges` function shall give the runs of sentences that changed between two texts, each with the sentences it removed and the ones it added in their place, split the way the "sentences changed" count splits them: at ".", "!" or "?" followed by a space, or at a line break. Sentences that stayed the same shall not be in it, and a text whose sentences only changed spacing shall give none.

## Examples

- Given "Write short sentences.\nNever promise money back." became "Write short, warm sentences.\nNever promise money back.", then there is one change that removes "Write short sentences." and adds "Write short, warm sentences.".
- Given "Be brief." became "Be brief. Use English.", then there is one change that adds "Use English." and removes nothing.
- Given "Be brief.  Use English." became "Be brief.\nUse English.", then there are no changes.
