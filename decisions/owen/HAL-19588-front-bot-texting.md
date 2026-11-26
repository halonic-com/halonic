# Decision: the front bot texts back in short lines, labelled as the assistant

- Task: HAL-19588
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19588 (board direction on HAL-10, 26 Nov: short, varied, texting-style replies over several messages, shown as an assistant and not as the board; Julian's security review of #6515 on HAL-19588 signs the grounding change)
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:kY4ze2X5a6jUWw1WB7z/Ulryg9c8Y7x8VQvaEeqCcg8Y933izSRNLGzO927mPQBwvvTbZBp8xSmjSsL+V0Z5Aw==

## What changes

`paperclip.front-bot-first-reply` posts each line of a reply as its own
comment, starting with `*Assistant:* ` instead of `*Automatic note:* `, with a
short typing pause (0.7 seconds plus 35 ms per character, at most 2.5 seconds)
before each line after the first. Once the chat's agent answers, no further
line is posted.

`paperclip.front-bot-grounding` checks every line and rejects the whole reply
when one line fails, so a reply is never posted in part. The length limit is
now 12 words or 100 characters per line and at most 3 lines, instead of 30
words or 240 characters for the whole reply. A bare acknowledgement such as
"On it" is no longer rejected, since the board asked for exactly that. All the
other reasons stay; the yes/no check now also covers yeah, yup, yea, nah,
sure, "looks like it" and "seems so", and looks past texting openers such as
"Hmm," or "Good question," so "Hmm, yeah, looks like it" is still rejected.
The first reply also rejects the "-ing" forms of the result words (merging,
deploying, starting, rerunning, rolling back and the like). These sit in their
own list: progress notes keep the old result words, so a true note such as
"Adding a test for it now." still passes.

`paperclip.front-bot-own-comments` treats a comment with no author that starts
with `*Assistant:* ` as the bot's, and still recognises the older
`*Automatic note:* ` comments.

New must-fail cases cover the short style. No test is skipped or deleted, and
no requirement is retired.

## Why

The board found the single long notes generic and samey, and wants replies
that react to the message like someone texting, split over several short
messages. The plugin SDK can't post as Chief, so the label marks the lines as
the assistant's until the client shows them as such.

## Covers

- paperclip.front-bot-first-reply
- paperclip.front-bot-grounding
- paperclip.front-bot-own-comments
