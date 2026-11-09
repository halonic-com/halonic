# shell.announcer

- Status: active
- Since: 0.1.0
- Source: HAL-965 (E1), HAL-973

The shell shall give each window one announcer, shared by every workspace in the window and reachable as `shell.announcer` and on every `WorkspaceContext`. When `announce(text, politeness)` is called, the shell shall read the text on its next timer tick in the polite or assertive live region (polite when no politeness is given). If the same text was read less than 2 s before, then the shell shall not read it again. When the same text is asked for politely and assertively before it is read, the shell shall read it once, assertively. When `announceState(key, text)` is called, the shell shall wait until 2 s pass without another call for the same key, then announce only the last text, politely. When an announcement asks for `whenWindowFocused` and the window doesn't have focus, the shell shall hold it until the window has focus again. While a modal has pushed its own regions, the shell shall read announcements in the topmost modal's regions, and after that modal releases them, in the regions below it. Until the frame mounts its regions, the shell shall hold announcements and read them once the regions are mounted. If a text or state key is empty, or the frame mounts regions a second time, then the shell shall throw a `ShellError`.

## Examples

- Given the frame's regions are mounted,
  when "Saved." is announced twice within 1 s,
  then the polite region reads "Saved." once; announced again 2 s after it was read, it is read again.
- Given "Run 43 failed." is announced politely and then assertively in the same moment,
  when the announcer reads,
  then only the assertive region reads it, once.
- Given `announceState("run:43", …)` is called with "Running.", "Needs you." and "Running." within 1 s,
  when 2 s pass after the last call,
  then the polite region reads "Running." once.
- Given the window has lost focus to the browser,
  when "fin@acme.example is signed in." is announced with `whenWindowFocused`,
  then nothing is read until the window has focus again, and then it is read.
- Given a dialog has pushed its regions over the frame's,
  when "Copied." is announced,
  then the dialog's polite region reads it; after the dialog closes, announcements go to the frame's regions again.
