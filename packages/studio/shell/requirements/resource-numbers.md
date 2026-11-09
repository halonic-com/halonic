# shell.resource-numbers

- Status: active
- Since: 0.1.0
- Source: HAL-1668 (FS7), HAL-1729

The shell shall read the engine's resource report: the engine's memory, the memory of each process it started, the disk space Halonic's data uses, the free space on the data folder's drive, and the local models Ollama has loaded. When Ollama didn't answer, the shell shall keep the loaded models unknown rather than empty. If a number in the report is missing, negative or not finite, or a list isn't one, then the shell shall throw a `ShellError` and not show the report. The shell shall read the report when it starts watching and then once a minute, timed from the end of the last read, and whenever a run, a download or a model pull asks before it starts. While a read is under way, a check shall join it instead of reading again. The shell shall mark the disk low when less than 1 GB is free. If a minute's read fails, then the shell shall pass the error on and read again the next minute. After the watch stops, the shell shall not read by itself and shall drop readings that arrive later.

## Examples

- Given the data drive has 0.8 GB free,
  when a model pull checks before it starts,
  then the reading says the disk is low.
- Given the data drive has exactly 1 GB free,
  when the minute's check reads the report,
  then the disk is not low.
- Given the engine didn't answer the last minute's read,
  when the next minute comes,
  then the shell reads again, and the failed read's error was passed on.
