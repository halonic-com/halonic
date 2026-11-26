# feedback.help-send-feedback

- Status: active
- Since: unreleased
- Source: HAL-19422, part C of HAL-19400 (UX gap G6 from the HAL-19383 walk-through, team decision with the designer: entries on approved screens, no new screen; plan approved by Liam on HAL-19400); Chief's release-gate note G2 for when it shows, as `feedback.connected-only`

While Studio's own main window takes feedback and Studio is connected to Paperclip, the Help menu shall have the item "Send feedback ({keys})" and Ctrl K the entry of the same name, and picking either shall begin a feedback as the feedback shortcut does, asking the shell for the still only once the window has drawn twice, so the Help menu or the palette isn't in it. The keys shall be the feedback shortcut the window hears, written as a sentence writes them: "Ctrl+Shift+F" until another is saved, joined by "+" on Windows and Linux, and in the platform's own key names with nothing between them on macOS, such as "⌘⇧F". When Settings saves another shortcut, the item and the entry shall name it. While Studio isn't connected to Paperclip, by the same check that lets the shortcut through then, and where the window takes no feedback, as in the served Studio, on a phone or in any window but Studio's own, neither shall show. When Studio connects, they shall show without a restart. While a feedback shows or starts, picking either shall leave it as it is.

## Examples

- Given Studio's own window on Windows, connected to Paperclip,
  when the person opens Help,
  then it lists "Send feedback (Ctrl+Shift+F)", and picking it begins a feedback once the menu is gone.
- Given Studio's own window on macOS, connected to Paperclip,
  when the person types "Send feedback" in Ctrl K,
  then the entry reads "Send feedback (⌘⇧F)".
- Given Studio not connected to Paperclip,
  when the person opens Help or Ctrl K,
  then neither lists Send feedback.
- Given the served Studio,
  when the person opens Help or Ctrl K,
  then neither lists Send feedback.
