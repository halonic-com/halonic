# Decision: Settings › Assistant says "Model call limit", as the agent's Model page does

- Task: HAL-14710
- Approval: team decision under the HAL-2282 rule for small wording on approved screens (HAL-14707, Sofia; microcopy revision 117, cli-output revision 54); the reviewer of the pull request on HAL-14710 signs this note
- Kind: user-visible

## What changes

Since #3699 the agent's Model page labels `maxSteps` **Model call limit** (studio-claims 5.1, HAL-12642). The glossary's "turn limit" is now "model call limit" everywhere, for the agent and for the assistant. This pull request brings the rest of the built text in line:

- Settings › Assistant: the field is **Model call limit**, its hint "The most model calls in one answer before it stops and asks to continue.", its not-saved line "Couldn't save the model call limit on this computer." and the phone list's summary "smart · model call limit 16".
- The CLI's failure lines for an agent that ran out: "*Sorter* used all *6* model calls without finishing.", "used its only model call", "Its last calls to *search_docs* returned nothing." and "Raise its model call limit in *sorter.agent.yaml* if it needs more."
- The agent file's refusal ("The model call limit is a whole number from 1 to 200.") and the Try it chat's end line ("used all *n* model calls without finishing.").

The requirements `settings.ai-agent-fields`, `settings.ai-agent-prefs`, `settings.ai-agent-section`, `settings.ai-agent-view-only` and `settings.section-summaries` change only the field's name and the summary they quote. No rule, value or example is removed or weakened, no test was skipped, and every changed test still checks the line the screen shows. Code names (`turnLimit`, `maxSteps`, the reason code `turn-limit`) stay.

Studio's run banner and Inbox notice for `turn-limit` and the assistant chat's stop line are not built yet, so there is nothing to change for them here.

## Why

"Turn" didn't say what is counted, and in a chat it reads as one message. The agent's own page already says "Model call limit", so the same limit had two names. These are small wording fixes on screens the board already approved, so the team decides them (HAL-2282).

## Covers

- settings.ai-agent-fields
- settings.ai-agent-prefs
- settings.ai-agent-section
- settings.ai-agent-view-only
- settings.section-summaries
