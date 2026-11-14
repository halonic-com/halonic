# app.sandbox-choice

- Status: active
- Since: 0.1.0
- Source: HAL-5392; HAL-3779 design (2.2-2.4, 6); HAL-3306; docs/adr/2026-11-10-mxc-sandbox-backend.md ("Choosing a sandbox on Windows", "The trust check"); board decision HAL-2546; the plan on HAL-3292

The sandbox choice shall read the person's saved sandbox setting and report which backend runs. A setting that names a backend shall run only that backend, once its own check and, where it has a canary, its trust check pass. A setting of `none` shall run no sandbox and no check. With no setting, the first backend of the platform's default list that passes shall run: `srt-wsl` only on Windows, `srt` elsewhere, and never `none`, native srt on Windows or MXC. When the chosen backend can't run or fails its trust check, nothing shall run in another backend in its place, and the saved setting shall stay as the person left it. A failed trust check shall keep that backend off until Halonic starts again. When the chosen backend is offered but its one-time download isn't done, the choice shall run neither its own check nor its trust check, nothing shall run in another backend in its place, and its state shall be `setup-needed` with the setup code `download` and the reason code `download-needed` (also when the last download try failed, offline or not, with the sentence behind it for logs). The choice shall download only when the host calls `download(id)`, which the host does when the person picks that backend and has saved the pick; `download(id)` shall then choose again from the saved setting, so a successful download is followed by the trust check. Starting, a settings change and a `not-fenced` session shall never download. The choice shall choose again after every change to the setting and when a session's fence proof is `not-fenced`, and shall run one trust check at a time. It shall report, for every backend the host hands over, whether this computer offers it, its state, the reason and the sentences behind it for logs, its limits and the residuals seen at this start, as codes from closed lists. A setting the store gives back that isn't valid shall make the choice throw.

## Examples

- Given Linux or macOS and no setting,
  then `srt` runs when its check passes.
- Given Windows and no setting, with native srt and MXC working,
  then nothing runs unless `srt-wsl` passes, and no trust check runs for srt or MXC.
- Given a setting of `srt` on Windows,
  then only native srt is checked and runs.
- Given a setting of `none`,
  then `active` is `none` and no trust check runs.
- Given a chosen backend whose check says `setup-needed`,
  then nothing runs, its state is `setup-needed` with that reason, and no other backend runs.
- Given MXC chosen, srt working and the SDK not downloaded,
  then nothing runs, no check and no trust check run, MXC is `setup-needed` with `download` and `download-needed`, and nothing was downloaded.
- Given a start, a settings change or a `not-fenced` session with a download open,
  then nothing is downloaded.
- Given MXC `setup-needed` and the host calling `download("mxc")` with a registry that answers,
  then the SDK is downloaded, the choice is made again from the saved setting, the trust check runs and MXC is in use.
- Given a download that fails,
  then MXC stays `setup-needed` with `download-needed` and the sentence, and the next `download("mxc")` tries again.
- Given a computer that doesn't offer the chosen backend,
  then nothing runs, the backend is shown as not offered and no check runs.
- Given a setting that names a backend the host didn't hand over,
  then nothing runs.
- Given MXC chosen and a trust check that fails with `too-strict`,
  then nothing runs, MXC is `check-failed` with `too-strict`, srt stays `available` and the setting is unchanged.
- Given a trust check that failed in this start,
  then a settings change or a `not-fenced` session runs no new check and the backend stays off; a new start checks again.
- Given a backend in use and a session whose fence proof is `not-fenced`,
  then the trust check runs again, and the backend is off for this start if it fails.
- Given MXC in use,
  then its limits are listed and `name-lookups-leave` is a residual when the trust check saw it.
- Given a store that gives back `{ backend: "docker" }`,
  then the choice throws and `current()` stays as it was.
