# Decision: the Runs banners take the approved words

- Approval: HAL-11370 (design check R1, words from microcopy revision 104, decided by the team under HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mWWVEMd/aMR3s8Fii0LwueSZwWZTWAhvQEknH9Kejt6zykTDaLNtBhjvEqQ+OoudtZVV7VlU8Ro+AedlJw4OBQ==

## What changes

`runs.run-view.sandbox-not-ready`: the refused-run banner now reads "*Agent* didn't start: the sandbox
can't start on this computer.", links the guide, and turns **Check again** into **Run again** once
the check passes, saying "The sandbox works now. You can run *Agent*." Before, it said "the sandbox
on this computer isn't ready.", named no button after a pass and said "The sandbox is ready. The next
run can start." Examples are changed to the new words and two are added; none is removed.

`runs.run-view.run-again`: a run that doesn't start reads "Couldn't start the run: *reason*" (a
colon, was a full stop) and is announced. Two examples are changed to the new words.

`runs.run-view.failure-banners`: a model call names the model alias, and the local-model banners
read as the approved words: **Open Models** on a local provider that can't be reached and on out
of memory, and the phone sentences ("on your computer", "Fix this on your computer: Models").
Examples keep their words; none is removed.

`runs.run-view.slow-step-line`: an Ollama model call reads "Waiting for Ollama. The first answer
can take a minute while it loads the model." The Limits line now says the phone variant is not
there yet.

## Why

Microcopy 23.3 and 9.6 gave these words, and the design check found the build used older ones.

## Covers

- runs.run-view.run-again
- runs.run-view.sandbox-not-ready
- runs.run-view.failure-banners
- runs.run-view.slow-step-line
