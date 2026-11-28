# Decision: a toast's two actions share one row under the text

- Approval: Paperclip task HAL-20904 (follow-up to the visual check of #6857); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XH3HqYLFVD6qTFNqZ8mWH0BuZO4dy833+ISeLcXLo4MMg5spIaGr2Z5uZ8MK77RtpGLfvbCnRSqlKnTyon9VCQ==

Since the pills in #6857 are wider than the old links, a toast with two actions put the first pill on the title line at the right and the second alone under the text at the left, so the two read as unrelated. Two actions now sit in one group that always takes its own row under the text, side by side and 8px apart, `action` first, starting at the text's left edge. A toast with one action is unchanged.

## Covers

- kit.toast
