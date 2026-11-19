# plugins.plugin-settings-load

- Status: active
- Since: unreleased
- Source: HAL-11646; UX acceptance rows P2 and P3 (HAL-11945); microcopy 1.1 and T22 (HAL-751)

While the feed's first read of the installed plugins is running, Settings → Plugins shall show nothing for 300 ms, then skeleton rows that a screen reader hears as "Loading plugins", and after 10 s "Still loading" with **Try again**. When the first read fails, the section shall say "Couldn't load your plugins", "Halonic couldn't read the plugins on this computer." whatever the error said, never a raw error or a path, and **Try again**, start-aligned in the error tone. **Try again** shall read the plugins again, be busy while it reads and keep the focus; when the plugins read, the focus shall move to the section's heading. When it fails again, the section shall keep the error with **Try again** no longer busy.

## Examples

- Given the first read is running,
  when 100 ms pass,
  then no skeleton is shown; after 300 ms the screen reader hears "Loading plugins".
- Given the first read failed with the folder reader's error "Permission denied (os error 13)",
  then the section says "Couldn't load your plugins", "Halonic couldn't read the plugins on this computer." and **Try again**.
- Given the first read failed,
  when the person presses **Try again** and the plugins read,
  then the button is busy while it reads, the plugins show, and the focus is on the section's heading.
