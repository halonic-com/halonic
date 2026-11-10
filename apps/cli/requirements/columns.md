# cli.columns

- Status: active
- Since: 0.1.0
- Source: the CLI output design on HAL-1981 (cli-output section 3.4, "the list", revision 27: "Columns line up with spaces, each as wide as its longest entry"), approved by the board on HAL-2123 (HAL-2742)

When the `halonic` command prints lines in columns, it shall make each column as wide as its longest entry as the stream shows it, with or without UTF-8 marks, and put three spaces between two columns. The last column shall not be padded, so no line ends in spaces.

## Examples

- Given the rows "✓ Done", "01jd8q" and "! Needs you", "01jd9a",
  when they are printed in a stream that shows the Unicode marks,
  then the lines read `✓ Done        01jd8q` and `! Needs you   01jd9a`.
- Given the rows "✓ Done", "01jd8q" and "◌ Running", "01jd9c",
  when they are printed in a stream that isn't UTF-8, where ✓ reads "ok" and ◌ reads "..",
  then the lines read `ok Done      01jd8q` and `.. Running   01jd9c`, and the ids still line up.
