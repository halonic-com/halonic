# studio.desktop-plugins-first-read

- Status: active
- Since: unreleased
- Source: HAL-11646; UX acceptance rows P2 and P3 (HAL-11945)

The desktop plugins feed shall say how its first read went: reading until a read ends, failed with the error while no read has worked, and ready once one has. When that state changes, the feed shall tell its listeners, also when the plugins it found are the same as before. A read that fails after one has worked shall leave it ready.

## Examples

- Given a new feed, then its first read is reading.
- Given a new feed,
  when the plugins folder can't be listed,
  then its first read has failed with that error and its listeners are told.
- Given a feed whose first read failed,
  when it reads again and the folder has no plugins,
  then its first read is ready and its listeners are told.
- Given a feed that has read the plugins,
  when the plugins folder can't be listed,
  then its first read stays ready.
