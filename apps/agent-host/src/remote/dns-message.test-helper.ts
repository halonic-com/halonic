/** A record of a response, as a test reads it back. */
export interface ReadRecord {
  readonly section: "answer" | "additional";
  readonly name: string;
  readonly type: number;
  readonly cacheFlush: boolean;
  readonly ttl: number;
  /** PTR and SRV: the target; TXT: the entries joined by "|"; A: the address. */
  readonly data: string;
  readonly port?: number;
}

/** Reads a response `writeResponse` wrote (names uncompressed), for the tests to check. */
export function readResponse(message: Uint8Array): { flags: number; records: ReadRecord[] } {
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const answers = view.getUint16(6);
  const total = answers + view.getUint16(8) + view.getUint16(10);
  const records: ReadRecord[] = [];
  let offset = 12;
  for (let index = 0; index < total; index += 1) {
    const name = readName(message, offset);
    offset = name.end;
    const type = view.getUint16(offset);
    const recordClass = view.getUint16(offset + 2);
    const ttl = view.getUint32(offset + 4);
    const length = view.getUint16(offset + 8);
    const start = offset + 10;
    const rdata = message.subarray(start, start + length);
    records.push({
      section: index < answers ? "answer" : "additional",
      name: name.text,
      type,
      cacheFlush: (recordClass & 0x8000) !== 0,
      ttl,
      ...readData(type, rdata, message, start),
    });
    offset = start + length;
  }
  return { flags: view.getUint16(2), records };
}

function readData(type: number, rdata: Uint8Array, message: Uint8Array, start: number) {
  if (type === 1) return { data: Array.from(rdata).join(".") };
  if (type === 12) return { data: readName(message, start).text };
  if (type === 33) {
    const port = new DataView(rdata.buffer, rdata.byteOffset).getUint16(4);
    return { data: readName(message, start + 6).text, port };
  }
  const entries: string[] = [];
  for (let at = 0; at < rdata.length; at += 1 + (rdata[at] as number)) {
    entries.push(new TextDecoder().decode(rdata.subarray(at + 1, at + 1 + (rdata[at] as number))));
  }
  return { data: entries.join("|") };
}

function readName(message: Uint8Array, offset: number): { text: string; end: number } {
  const labels: string[] = [];
  let at = offset;
  while (message[at] !== 0) {
    const length = message[at] as number;
    labels.push(new TextDecoder().decode(message.subarray(at + 1, at + 1 + length)));
    at += 1 + length;
  }
  return { text: labels.join("."), end: at + 1 };
}

/** A query for one name and type, as a phone's browser sends it; `pointer` repeats the name by a compression pointer. */
export function queryFor(name: string, type: number, pointer = false): Uint8Array {
  const labels = name
    .split(".")
    .flatMap((label) => [label.length, ...new TextEncoder().encode(label)]);
  const question = [...labels, 0, type >> 8, type & 0xff, 0, 1];
  const second = pointer ? [0xc0, 12, type >> 8, type & 0xff, 0, 1] : [];
  return Uint8Array.from([
    0,
    0,
    0,
    0,
    0,
    pointer ? 2 : 1,
    0,
    0,
    0,
    0,
    0,
    0,
    ...question,
    ...second,
  ]);
}
