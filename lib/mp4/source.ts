import type { RandomAccessSource } from "./types";

export class BlobSource implements RandomAccessSource {
  readonly size: number;
  constructor(readonly blob: Blob) { this.size = blob.size; }
  async read(start: number, length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > this.size) {
      throw new RangeError(`Invalid read [${start}, ${start + length}) for ${this.size}-byte source`);
    }
    return new Uint8Array(await this.blob.slice(start, start + length).arrayBuffer());
  }
}

export class BufferSource implements RandomAccessSource {
  readonly size: number;
  constructor(readonly bytes: Uint8Array) { this.size = bytes.byteLength; }
  async read(start: number, length: number): Promise<Uint8Array> {
    if (start < 0 || length < 0 || start + length > this.size) throw new RangeError("Read outside source");
    return this.bytes.slice(start, start + length);
  }
}
