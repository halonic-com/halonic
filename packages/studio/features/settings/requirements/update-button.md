# settings.update-button

- Status: active
- Since: unreleased
- Source: HAL-19364 (the board's request on HAL-10); HAL-19365 (plan review)

Where the app gives an updater and no other tool manages updates, the title bar shall show **Update**
at its right end while a newer version is available, downloading, failed to download, refused for its
signature or ready to install, named "Update available: Halonic *0.1.1*", and at no other time. A
press shall open the Update available dialog (`settings.update-dialog`).

## Examples

- Given Halonic 0.1.0 and the updater found 0.1.1,
  when the window shows,
  then the title bar has **Update**, named "Update available: Halonic 0.1.1".
- Given Halonic is up to date, or hasn't checked yet,
  when the window shows,
  then the title bar has no **Update**.
- Given Scoop manages updates and has 0.1.1,
  when the window shows,
  then the title bar has no **Update**.
