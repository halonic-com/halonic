# Decision: an agent file says when a Claude Code agent's tools ask first

- Approval: HAL-14992, Owen's plan approved with changes by Liam
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zGX/SvClUAiDL28jWyCMlOGSxj2eIofBcs0s63WJXC6Z8S5CKdif2WPR0mcD6LFs6JUBfNbGoMR59oNP/AbrBg==

A Claude Code agent in a headless `halonic run` can't edit or run anything:
every Edit, Write and Bash call asks for a person's OK, and the CLI refuses
each one. The plan on HAL-14992 adds a per-agent switch, `asks: always |
in-sandbox`, in the agent file, so the person's trust covers it. This pull
request adds only the field and what shows it. Nothing answers on its own
yet; the host policy that reads `in-sandbox` is the next pull request, with
its own note.

- The format accepts `asks` on `harness: claude-code` only, and refuses it,
  even `always`, on Codex and Halonic's own loop, because Codex in the
  sandbox doesn't ask whatever the file says (Liam's change 3).
  `halonic run --harness codex` and `halonic runs send` refuse an agent with
  `asks` for the same reason.
- `asks: in-sandbox` joins the agent's trust content; the default adds
  nothing, so every fingerprint trusted today stays the same. The CLI's trust
  check and Studio's trust review show it and its changes.
- Try it holds `asks` back with the other trust and sandbox fields, and the
  Changes list marks it important. Both requirements only grow: nothing held
  back or marked before stops being so.
- The released 0.1.0 spec keeps every file that parsed before; the JSON
  schema only gains the optional field.

## Covers

- packages/core/format/spec/agent.schema.json
- app.review-try-it-holds-back
- app.change-line-important
