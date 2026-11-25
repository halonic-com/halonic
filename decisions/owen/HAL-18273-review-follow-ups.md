# Decision: the settings writer refuses symbolic-linked parents, and the Worker has five Durable Object classes

- Approval: Paperclip task HAL-18273 (from the #5990 reviews, split out of HAL-18242); the approver signs this note in review
- Kind: internal

**`harness-kit.session-settings-folder`.** The requirement said the writer reaches only the settings and temp folders, and its rationale that a wrong path must never reach the working folder. Its check read only the path's text, so a symbolic link the program made in its temp folder could send a write or an `rm -rf` through it to `/work`. That reached nothing outside the run's own container, but the rationale claimed more than the code did. Each script now walks the path's parent folders, up to and including the folder it is inside, and refuses with exit code 4 when one of them is a link. The path itself may still be a link: `mv` and `rm` act on the link, never on where it points. The requirement now says so, and gains an example and a test for it. The check runs in the sandbox just before the operation, which is the closest the writer can get from outside it.

**`publish.worker-bundle` and `publish.worker-files`.** Their texts still counted three and four Durable Object classes. With `UsageObject` and `RunContainerObject` (#5938) the Worker exports five, as its `wrangler.toml` binds. Only the counts change; no test changes.

## Covers

- packages/adapters/harness-kit/requirements/session-settings-folder.md
- tooling/publish/requirements/worker-bundle.md
- tooling/publish/requirements/worker-files.md
