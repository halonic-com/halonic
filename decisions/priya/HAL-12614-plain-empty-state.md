# Decision: a plain empty state's title is a paragraph, not a heading

- Approval: Liam placed this on HAL-12614, from Sofia's keyboard and screen-reader check on HAL-12584 (row H1); it fixes the markup of existing screens with no new words, a team decision with no board card (HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:khw0y1i6tRzt1leSm30OihDo7aHieSPJqE0NN7ToXTqc6+ebc7SGVNOX165jidyBaL5W7rPVpRHGFbDUw8FzAw==
- Task: HAL-12614

## What changes

A `plain` Empty state is one line under a heading that's already there: Home's Needs you and
Recent runs, the Inbox's Needs you, no search results, a small panel or the file tree. Its title
was a heading at the same level as the section's own, so moving by headings with a screen reader
read "Needs you", then "Nothing is waiting for you." as if it were a section of its own (WCAG
1.3.1).

- `kit.empty-state`: a `plain` title is now a `<p>`, with the same `text-section` look. Every other
  Empty state keeps its heading and its level.
- The title keeps `tabindex="-1"` and its `titleRef`: a List focuses a plain no-results title when
  the last matching row goes (component specs 23 A2), as the Library does after a delete. The ref
  now takes any `HTMLElement`, since the title can be a heading or a paragraph.

Nothing a sighted user sees changes.

## Covers

- kit.empty-state
