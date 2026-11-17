# app.no-sandbox

- Status: active
- Since: unreleased
- Source: HAL-5397; HAL-3779 design (section 7); security conditions N8 on HAL-5397

When the person chooses no sandbox, the app shall save the setting `none` with the time of the choice and the running app version, replacing any choice before, and taking it back shall delete the setting. Only these two calls shall save or delete the choice `none`, and taking it back shall keep any other saved backend. There shall be no command line flag to run without the sandbox.

## Examples

- Given no saved setting, when the person chooses no sandbox at 09:00 on version 0.1.0,
  then `{ backend: "none", chosenAt: "…09:00…", appVersion: "0.1.0" }` is saved.
- Given a saved `srt` setting, when the person chooses no sandbox,
  then the setting is replaced by `none`.
- Given a saved `none`, when the person takes it back,
  then no setting is saved.
