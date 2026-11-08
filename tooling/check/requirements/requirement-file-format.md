# check.requirement-file-format

- Status: active
- Since: 0.1.0
- Source: HAL-107

If a requirement file does not follow the requirement file format, then the repo checks shall report it as malformed, with the line and what is wrong.

## Examples

- Given a file with the heading, Status, Since, Source, an EARS sentence and two Given/Then examples,
  when the checks read it,
  then they return each of those parts.
- Given a file whose heading ID differs from the ID its path gives,
  when the checks read it,
  then they report line 1 as not matching the path.
- Given a file with "Status: done",
  when the checks read it,
  then they report that the status is not draft, active or retired.
- Given a file whose sentence has no "shall", or doesn't start with The, When, While, If or Where,
  when the checks read it,
  then they report that the sentence is not in EARS form.
- Given a file without a "## Examples" section, or with an example that doesn't start with "Given" or has no "then",
  when the checks read it,
  then they report the example as malformed.
