# studio.desktop-page

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 16b part 2; HAL-1253 (the Android app ships none of the Studio)

The desktop app shall open its window on the Studio page (`studio.entry`), built into `dist/studio` before the app is built or started. The Android app shall keep opening its own connect page from `dist/connect`, so it ships none of the Studio.

## Examples

- Given the desktop app,
  when it starts,
  then its window shows `studio.html` from `dist/studio`.
- Given `tauri build` or `tauri dev`,
  when it runs,
  then it builds both pages first (`pnpm run build`).
- Given the Android app,
  when it starts,
  then its window shows `connect.html` from `dist/connect`.
