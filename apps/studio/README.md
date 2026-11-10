# @halonicjs/app-studio

The Studio app. It holds the Studio's feature list: one
`"@halonicjs/studio-feature-<name>": "workspace:*"` dependency per feature,
kept in step with `packages/studio/features/` by `pnpm discover --fix` and
checked by `pnpm check features`. Vite builds only the Android app's own page (`connect.html`).

- **Layer:** apps
- **Owner:** elena

## The shell

`src-tauri/` is the Tauri shell, a Cargo workspace whose root package is the
app. Today it is the minimal Android connect shell: it opens one window with
the page in `connect/` and has no plugins, commands or capabilities yet.
`src-tauri/gen/android/` is the Android project, generated once by
`tauri android init` and kept in git, so changes to it show up in review.

To build the debug APK yourself you need Rust, Java 17, the Android SDK and
the NDK, with `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` set:

```sh
cd apps/studio
pnpm exec tauri android build --debug --apk --target aarch64
```

CI builds it for arm64 and x86_64 in the `android` job and keeps the APK as
a download on the run for seven days.
