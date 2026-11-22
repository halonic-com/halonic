# Decision: C704 rows 3 and 27, "You rejected in run" and a hidden character in the URL refusal

- Task: HAL-16424, from the words check C704 rows 3, 5, 26 and 27 on HAL-16417 (#5168, #5211)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16424 (a wording fix in command output and a refusal, so a team decision under the HAL-2282 rule; the reviewer's code review signs this note)
- Kind: user-visible

## What changes

- `cli.commands.runs.send`: for the event `reject`, the line after sending reads "✓ You rejected in run <short id>. <title> goes on." instead of "✓ You rejected run <short id>. …". Its example changes the same way; no example is added or removed.
- `workspace.trust-url-hidden-characters`: the refusal reads "the URL has a hidden character, such as a line break, or a space at its start or end" instead of "the URL has a control character, or a space at its start or end". What is refused doesn't change.

## Why

"You rejected run 01jd8q" reads as if you rejected the run itself, and then "goes on" sounds like a contradiction. What you rejected is the run's question, so the verb takes no object, as in Studio ("You rejected at 10:42") and `halonic runs show` ("you rejected 2 min ago"). "Control character" is a programmer's word, and the trust check shows this refusal to anyone; the changeset already calls it "hidden".

## Tests

No test was weakened or skipped. `send-follow.test.ts` and `trust-url.test.ts` expect the new words; they make the same calls as before.

## Covers

- cli.commands.runs.send
- workspace.trust-url-hidden-characters
