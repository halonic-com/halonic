# settings.section-commands

- Status: active
- Since: 0.1.0
- Source: HAL-7331 (T11); flow-settings 2 and 12 (HAL-646); HAL-1295 (About Halonic)

The Settings feature shall add a Ctrl K command for each of the sections Appearance (`appearance`), Formats (`formats`), Assistant (`assistant`), Trusted sources (`trusted-sources`), Agent sandbox (`agent-sandbox`) and About Halonic (`about`) that a feature added to Settings, whichever feature added it, named as the section's row. Running one shall open Settings on its section through the window's `openSettings`. A section no feature added shall have no command, and Models, Trust, Workspace and Developer shall have none, because Ctrl K takes Models and Trust to the workspace page. Without a window's `settingsSections`, there shall be no section commands.

## Examples

- Given features added Appearance, Formats and Developer to Settings,
  when Ctrl K lists the commands,
  then it lists **Appearance** and **Formats**, and no **Developer**.
- Given no feature added Agent sandbox,
  when Ctrl K lists the commands,
  then it has no **Agent sandbox**.
- Given features added Assistant,
  when the user runs **Assistant** from Ctrl K,
  then Settings opens on Assistant.
