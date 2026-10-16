import { sha256 } from "@noble/hashes/sha256";

export async function hashBlobRanges(blob: Blob, ranges: Array<{ start: number; end: number }>, onProgress?: (fraction: number) => void): Promise<string> {
  const hasher = sha256.create();
  const total = ranges.reduce((sum, range) => sum + range.end - range.start, 0);
  let done = 0;
  const chunkSize = 4 * 1024 * 1024;
  for (const range of ranges) {
    for (let offset = range.start; offset < range.end; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, range.end);
      hasher.update(new Uint8Array(await blob.slice(offset, end).arrayBuffer()));
      done += end - offset;
      onProgress?.(total ? done / total : 1);
    }
  }
  return Array.from(hasher.digest(), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
