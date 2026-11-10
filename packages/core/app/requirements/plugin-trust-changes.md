# app.plugin-trust-changes

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, section 4 ("any change turns it off", no shrinking for plugins), approved by Liam on HAL-4038; the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 6: the prompt shows what changed

The app shall compare the content kept in a plugin's trust record with its current content and give what changed, by section: the plugin's own fields; hosts, secrets, tools and local tools added, changed (with the fields that differ) and removed; files added, changed and removed, by path; and the top-level manifest fields that differ. A removed tool, host or file shall count as a change like any other, and there shall be no way for a plugin's record to shrink by itself. When the record's content isn't plugin content, such as after a hand edit, the app shall say it can't show what changed.

## Examples

- Given a trusted plugin whose tool `post-report` goes from risk `send` to `write`,
  when it is compared,
  then `post-report` is changed in `risk`, and the manifest field `backend` differs.
- Given a trusted plugin whose `backend/index.js` hash changes and which gains `backend/extra.js`,
  when it is compared,
  then the files show `backend/extra.js` added and `backend/index.js` changed.
- Given a trusted plugin that loses a tool,
  when it is compared,
  then the tool is removed, and the changes have no way to shrink the record.
- Given a trust record whose content is `{ connectors: [] }`,
  when it is compared,
  then the changes are not readable.
