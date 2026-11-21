# Decision: plugins go view only where Studio runs, not by window width; the ⋮ in a collection rings inside

- Approval: HAL-14579; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BGA8ZSOH0o8ZzTo+McYI1tYCxXq91INGnxwZOambR0pq+uvU0AfAHCCRw759x4O9CFMo4d5Gy3T1EjmuzMl3Ag==

## What changes

- `plugins.plugin-page` and `plugins.plugin-list`: view only follows where Studio runs, a phone
  or a browser on `halonic serve`, not the window's width. A desktop window narrower than a phone,
  or at 400 % zoom, keeps Trust, Update, Sign in, Remove trust and the ⋮, and shows no view-only
  line. A narrow window still gets the stacked layout.
- `google-setup.connector-block`: the Google block on a connector's page goes text only on a
  phone, the same rule the Library's listed tools use, and nowhere else.
- `kit.button-ring-inset` (new): the kit's `Button` can draw its focus ring inside its edge. A
  record's ⋮ in a collection uses it, as the grid's cells do, so the ring isn't cut off at the
  grid's right edge on a phone.

## Why

Sofia's C422 check (HAL-14560, rows VO1 and RG1) found that in the desktop app a window below
600 px counted as a phone, so a plugin's actions disappeared, and at 400 % zoom they couldn't be
done at all. Plugins ship only in the desktop app, so width was the wrong signal. Settings already
decides view only from where Studio runs (`settingsWhere`); the plugins now do the same. Both rows
were decided by the team on HAL-14560, not the board.

## Covers

- plugins.plugin-page
- plugins.plugin-list
- google-setup.connector-block
- kit.button-ring-inset
