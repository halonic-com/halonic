# settings.formats-format

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); req-settings `settings.formats.one-format-setting`, `.default-follows-system` (HAL-110, HAL-119); flow-settings 5 (HAL-646); ux-checklists-t4-t5-t11 3.10 (HAL-1185)

The Studio shall keep one format for numbers, dates and money, following the computer's region format by default, or the browser's language when served. The Format choice shall list "Follow this computer:" (or "Follow this browser:" when served) with the followed format's name first, then each format of a fixed list that the window can format, named in English by language and region and sorted by name. The Studio shall store the chosen format's tag, never its name. When the stored format isn't "follow" or a tag in the list, the format shall follow the computer. The Studio shall read a followed format given as a system setting (such as `en_GB.UTF-8`) or with extensions (such as `en-GB-u-ca-buddhist`) as its language and region, and one it can't read as the window's own format. Under the choice, the Studio shall show an example of a number and a date in the chosen format, with no currency.

## Examples

- Given the computer's region format is English (United Kingdom),
  when the Format options are listed in the desktop app,
  then the first reads "Follow this computer: English (United Kingdom)".
- Given the browser's language is Dutch (Netherlands),
  when the Format options are listed in a browser,
  then the first reads "Follow this browser: Dutch (Netherlands)".
- Given the format is English (United Kingdom),
  when the example shows,
  then it reads "45.00 · Mon 9 Nov, 08:00".
- Given the format is Dutch (Netherlands),
  when the example shows,
  then it reads "45,00 · ma 9 nov, 08:00".
- Given the computer's region format is `en_GB.UTF-8`,
  when the Format options are listed in the desktop app,
  then the first reads "Follow this computer: English (United Kingdom)".
- Given the stored format is "Dutch (Netherlands)",
  when the window opens,
  then the format follows the computer.
