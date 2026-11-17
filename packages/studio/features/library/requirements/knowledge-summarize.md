# library.knowledge-summarize

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P6c); flow-library 5.2; `library.knowledge.summarize-on-request`, `library.knowledge.summarize-needs-local-model` (HAL-119)

When **Summarize** is asked, the page shall read "Summarizing…", stay busy and keep focus, then show an editable "Draft summary" box with **Use this summary** and **Discard**, move focus to the box and read "Draft summary ready. Use this summary or Discard." Nothing shall be drafted until it is asked, and nothing saved until **Use this summary**. **Use this summary** shall save the box's text as the summary, and **Use this summary** and **Discard** shall return focus to **Summarize**. If the default model alias has no local model, then the page shall say "Summarize uses a local model, and the default model alias has none." under the Summary row with **Models ›**. If the source has no documents or they can't be listed, then it shall say "Handbook has no documents to summarize, or Halonic can't list them." If the host can't be reached, then it shall say "Couldn't summarize Handbook:" and the window's own words for it, in lower case: "the engine isn't answering. It may still be starting." in the desktop app, "Halonic on the server isn't answering." in a served browser and "Halonic on your computer isn't answering." on a phone (microcopy 1.2) Any other failure shall say "Couldn't summarize Handbook." Errors show under the row, never as a toast, and never carry the engine's own text.

## Examples

- Given a source, when **Summarize** is clicked, then a draft box shows the drafted text and the host writes nothing.
- Given a draft, when **Use this summary** is clicked, then the host writes the file with that `summary`.
- Given a draft, when **Discard** is clicked, then nothing is written and the old summary stays.
- Given no local model, then the page says so and **Models ›** runs `workspace.open-models`.
- Given the host can't be reached, when **Summarize** is clicked, then the page says "Couldn't summarize Handbook: the engine isn't answering. It may still be starting." in the desktop app
