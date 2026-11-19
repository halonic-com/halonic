# app.new-item-fields

- Status: active
- Since: unreleased
- Source: HAL-12857 (a new item's detail on the Changes page, found in the re-walk HAL-12840, C86)

The `newItemFields` function shall give the fields of a new workspace item from its text, so the Changes page can show a new item the way it shows an edited one: it takes the kind from where the file sits, reads the text as that kind and gives each field that is set with the label an edited item's line uses, in the same order, then the other fields named from their keys. A skill's fields shall be named as the Library's skill page names them: Name, When to use it and Instructions. The id, which the file's name already gives, shall be left out. A file no kind places, or a text that doesn't read as its kind, shall give nothing.

## Examples

- Given a new `library/skills/refunds/SKILL.md` named "Refund handling", then its fields are "Name: Refund handling", "When to use it: …" and "Instructions: …".
- Given a new `agents/triage.agent.yaml` with its instructions before its name, then its fields come as Name, Instructions, Model, without Id.
- Given a new `notes/README.md`, then there are no fields.
