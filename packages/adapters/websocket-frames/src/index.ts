/**
 * Public entry point of `@halonicjs/adapter-websocket-frames`: WebSocket frames
 * (RFC 6455) read and written by our own code, for the remote gateway's server
 * side and the Paperclip events client.
 */
export {
  encodeFrame,
  type FrameEvent,
  FrameReader,
  type FrameSender,
  frameType,
} from "./websocket-frames.ts";
