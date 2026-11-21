# agent-host.engine-control-pipe

- Status: active
- Since: unreleased
- Source: HAL-14217; design note D2 and D4 on HAL-14206; security review on HAL-14212 (section 4)

The engine role's end of the control pipe shall write each of its messages as a 4-byte big-endian length followed by that many bytes of UTF-8 JSON, shall send its handshake before any other message, and shall number its broker requests from 1 without reusing a number. While 16 of its broker requests are unanswered, the engine shall answer a new one as refused with `busy`, as the shell's broker would, without sending it. If a frame from the shell has a length of 0 or over 128 KiB, is not UTF-8 JSON, has an unknown kind or broker result, a field its kind and result don't have or a field of the wrong type, answers a request that isn't open, or answers with the wrong result for its request, then the engine shall stop reading the pipe, fail every open request, and report one fault, whose message holds nothing of the frame's content. When standard input ends, the engine shall fail every open request and report that the shell is gone.

## Examples

- Given a handshake sent,
  when the engine asks for the secret `acme_key` and the shell answers `{"kind":"secret_answer","id":1,"result":"value","value":"…"}`,
  then the request resolves with the broker answer `{"result":"value","value":"…"}`, and a second answer with id 1 is a fault.
- Given the frame `{"kind":"stop","now":true}`,
  when the engine reads it,
  then it reports a fault and no stop.
- Given 16 unanswered requests,
  when the engine asks once more,
  then it gets a `busy` refusal and nothing more is written to the pipe.
- Given a health message before the handshake,
  when the engine sends it,
  then the send throws and nothing is written.
