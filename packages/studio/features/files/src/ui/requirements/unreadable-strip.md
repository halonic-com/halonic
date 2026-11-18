# files.ui.unreadable-strip

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 4.5 and 4.3; HAL-10534, HAL-11196

The file tab shall show, above the editor, "<name> can't be read: line n isn't valid YAML." for a YAML file that stopped being valid YAML, keep the text in the editor as typed, and take the strip away once the file reads again. The strip shall have the warning look (HAL-11624). When more than one strip applies, one shall show at a time, in this order: can't be read, in the trash, changed outside Halonic.

## Examples

- Given `a.agent.yaml` holds `name: [unclosed` on line 1, then the strip reads "a.agent.yaml can't be read: line 1 isn't valid YAML." and the editor shows the text.
- Given the user fixes the YAML, then the strip goes.
- Given a Markdown file with the same text, then no strip shows.
