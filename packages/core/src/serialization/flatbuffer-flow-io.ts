// File I/O helpers for the FlatBuffers/FlexBuffers hybrid format (see flatbuffer-flow.ts
// for the encode/decode logic itself). Split into its own module specifically because it
// needs Node builtins (`node:fs`) — this file must never be reachable from
// packages/editor-ui's browser bundle, only from `@flowserver/core`'s main barrel
// (server-side consumers like packages/editor-server).
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";

import type { Flow } from "../schema/node.types.js";
import { decodeFlow, encodeFlow } from "./flatbuffer-flow.js";

/** Single-shot write to disk. Flow files are small (hundreds of bytes to a few KB), so no
 * chunking is needed. */
export async function writeFlowFile(path: string, flow: Flow): Promise<void> {
  const bytes = encodeFlow(flow);
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(path);
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.end(bytes);
  });
}

/** Reads a `.fbflow` file from disk and decodes it. */
export async function readFlowFile(path: string): Promise<Flow> {
  const buffer = await readFile(path);
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return decodeFlow(bytes);
}
