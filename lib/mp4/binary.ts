export function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let i = 0; i < length; i += 1) value += String.fromCharCode(bytes[offset + i]);
  return value;
}

export function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

export function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

export function i32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, false);
}

export function u64(bytes: Uint8Array, offset: number): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, false);
}

export function writeU32(value: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(4));
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

export function fixed1616(raw: number): number { return raw / 65536; }

export function toFixed1616(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 65535.99998) throw new RangeError("Display dimension must be between 0 and 65535.99998");
  return Math.round(value * 65536) >>> 0;
}
