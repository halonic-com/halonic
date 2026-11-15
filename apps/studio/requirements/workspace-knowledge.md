# studio.workspace-knowledge

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P6d); flow-library 5.2; `library.knowledge.summarize-needs-local-model` (HAL-119)

When the knowledge page asks for a source, the desktop app shall give the text of `library/knowledge/<id>.yaml` (in the source's hub, or at the workspace root when shared) with its unsaved changes, and where its documents are: "Folder docs · N documents" for a `files` source, counting the `.md`, `.markdown` and `.txt` files under its `config.path`. A save shall be one change that shows in Changes and can be undone. When Summarize is asked, the app shall draft the summary from the source's documents with the default model alias's model, only when that model's provider runs on this machine, and shall save nothing. It shall say "no local model" when the alias is missing or its provider is not on this machine, and "no documents" when the source is not a `files` source or has no documents.

## Examples

- Given a `files` source with path `docs` holding two `.md` files and a `.png`, then its source reads "Folder docs · 2 documents".
- Given a source, when its text is saved, then one change `library/knowledge/<id>.yaml` is made and nothing is written to disk.
- Given a default alias on a local provider, when Summarize is asked, then the model is called with the documents and the answer is the draft; nothing is saved.
- Given a default alias on a remote provider, then Summarize says there is no local model and calls no model.
