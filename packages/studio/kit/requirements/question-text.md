# kit.question-text

- Status: draft
- Since: unreleased
- Source: HAL-20106 (Julian's review of #6658: one copy of the Inbox card's title and body, for the computer and the phone)

The kit's `questionTitle` shall give an agent's Markdown question's title: its first block as plain text, with its Markdown marks read and never shown, or a code block as it is. The kit's `questionBody` shall give the question without the line its title came from, so the title shows once, and empty when the question is no more than its title. A first block the title can't say in full, such as code or a link, shall stay in the body.

## Examples

- Given the question "# **Hire** an agent", then a blank line and "Iris, designer",
  then its title is "Hire an agent" and its body "Iris, designer".
- Given the question "Two open decisions",
  then its body is empty.
- Given a question whose first line has a link,
  then its body is the whole question.
