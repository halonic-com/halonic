# cli.commands.init.copy-example

- Status: active
- Since: 0.1.0
- Source: HAL-2336 step 3; the CLI output design on HAL-1981 (cli-output 3.1, "The Acme example", and 1.6), approved by the board on HAL-2123; Liam on HAL-1984: a run on the test model only needs no trust; `copyWorkspace` from `core/workspace` (`workspace.copy`)

The `halonic init [folder] --example acme` command shall lay out a copy of the repository's `examples/acme` with `copyWorkspace`, in the folder it is given, or without one in the first of `./acme`, `./acme-2`, … that is missing or empty, so a second copy never overwrites the first. It shall print the ✓ line, saying which folder was already there when the copy went next to it, the dimmed line with the copy's hubs, agents, workflows and routines, then the `Next:` block: `cd` into the folder, `halonic test` with its why-words, `halonic run support-reply --input examples/refund-question.json`, and the line that names Studio and Support reply. The copy shall use only the test model and no connector, knowledge source, integration, plugin or runtime, so that run needs no key and no trust. When the folder given has files in it, it shall write nothing and stop with "the folder isn't empty.", exit 5. An example it doesn't have is a usage error, exit 2, with "Did you mean" when one is close and the examples there are. With `--json`, it shall give the workspace's name and folder, `example: "acme"`, the files it wrote and the counts.

## Examples

- Given an empty folder,
  when `halonic init --example acme` runs in it,
  then `acme` holds every file of `examples/acme` and a `.gitignore`, and it prints "✓ Created a copy of the Acme example in ./acme.", " 2 hubs · 3 agents · 2 workflows · 1 routine · runs on the test model, no key needed", an empty line, "Next:", then, indented, `cd acme`, `halonic test` with "run its workflow tests (no key, nothing sent)", `halonic run support-reply --input examples/refund-question.json`, and "Or open the folder in Studio and start Support reply from the Inbox.", and exits with 0.
- Given a folder with an `acme` folder that has files in it,
  when `halonic init --example acme` runs,
  then the copy goes in `acme-2`, `acme` is unchanged, and the first line reads "✓ Created a copy of the Acme example in ./acme-2. ./acme was already there."
- Given `halonic init demo --example acme` and a `demo` folder with a `notes.txt` in it,
  when it runs,
  then it prints "✕ Couldn't create the workspace in ./demo: the folder isn't empty.", writes nothing and exits with 5.
- Given `halonic init --example acem`,
  when it runs,
  then it prints "✕ There's no example called "acem". Did you mean acme?" and " Examples: acme", writes nothing and exits with 2.
- Given a copy of the Acme example,
  when it is loaded,
  then it has no issue, every provider is the test model, and it has no connector, knowledge source, integration, plugin or runtime.
