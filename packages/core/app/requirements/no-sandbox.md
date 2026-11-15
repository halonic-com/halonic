# app.no-sandbox

- Status: active
- Since: 0.1.0
- Source: HAL-5397; HAL-3779 design (section 7); security conditions N8 on HAL-5397

Choosing no sandbox shall save the setting `none` with the time of the choice and the running app version, replacing any choice before, and taking it back shall delete the setting. Only these two calls shall save or delete the choice `none`, and taking it back shall keep any other saved backend. A command line `--no-sandbox` shall be allowed only when the saved setting already says `none`; otherwise it shall be refused with the reason `not-chosen`. The command line check shall never save or remove anything, and shall fail when the saved setting can't be read, so a damaged setting never allows it.

## Examples

- Given no saved setting, when the person chooses no sandbox at 09:00 on version 0.1.0,
  then `{ backend: "none", chosenAt: "…09:00…", appVersion: "0.1.0" }` is saved.
- Given a saved `srt` setting, when the person chooses no sandbox,
  then the setting is replaced by `none`.
- Given a saved `none`, when the person takes it back,
  then no setting is saved.
- Given no saved setting, when a CLI run asks for `--no-sandbox`,
  then it is refused with `not-chosen` and nothing is saved.
- Given a saved `srt` setting, when a CLI run asks for `--no-sandbox`,
  then it is refused with `not-chosen`.
- Given a saved `none`, when a CLI run asks for `--no-sandbox`,
  then it is allowed, and the setting is unchanged.
- Given a setting that can't be read, when a CLI run asks for `--no-sandbox`,
  then the check throws.
