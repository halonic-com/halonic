# ports.model-out-of-memory-text

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728, reviewed on HAL-2085; the loader's report added on HAL-6452

The ports package shall offer `isModelOutOfMemory(text)`, which a model provider calls on a model server's error text before it throws a `ModelCallError` with `out-of-memory`, and which shall be true when the text says the model ran out of memory: Ollama's memory check and its loader's out-of-memory report, llama.cpp's failed allocations, and the CUDA, ROCm and Metal out-of-memory messages, whatever their case. It shall be false for other errors, such as a missing model, a refused connection or a rate limit.

## Examples

- Given the text "model requires more system memory (12.0 GiB) than is available (7.6 GiB)",
  when it is checked,
  then it is out of memory.
- Given the text "CUDA error: out of memory",
  when it is checked,
  then it is out of memory.
- Given the text 'model "llama3" not found, try pulling it first',
  when it is checked,
  then it is not out of memory.
