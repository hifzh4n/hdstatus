function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0; for (const array of arrays) { out.set(array, offset); offset += array.length; } return out;
}
function text(value: string): Uint8Array { return Uint8Array.from(value, (c) => c.charCodeAt(0)); }
function be32(value: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, false); return b; }
function be64(value: bigint): Uint8Array { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, value, false); return b; }
function be16(value: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, value, false); return b; }
function i32(value: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, value, false); return b; }

export function box(type: string, ...payload: Uint8Array[]): Uint8Array { const body = concat(...payload); return concat(be32(body.length + 8), text(type), body); }
export function extendedBox(type: string, ...payload: Uint8Array[]): Uint8Array { const body = concat(...payload); return concat(be32(1), text(type), be64(BigInt(body.length + 16)), body); }
export function zeroBox(type: string, ...payload: Uint8Array[]): Uint8Array { return concat(be32(0), text(type), ...payload); }
function full(version = 0): Uint8Array { return Uint8Array.of(version, 0, 0, 0); }

function tkhd(width: number, height: number, version: 0 | 1, rotation: 0 | 90 | 180 | 270 = 0, id = 1): Uint8Array {
  const matrix: Record<number, number[]> = {
    0: [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824],
    90: [0, 65536, 0, -65536, 0, 0, 0, 0, 1073741824],
    180: [-65536, 0, 0, 0, -65536, 0, 0, 0, 1073741824],
    270: [0, -65536, 0, 65536, 0, 0, 0, 0, 1073741824],
  };
  const time = version ? concat(be64(0n), be64(0n), be32(id), be32(0), be64(6000n)) : concat(be32(0), be32(0), be32(id), be32(0), be32(6000));
  return box("tkhd", full(version), time, new Uint8Array(8), be16(0), be16(0), be16(0), be16(0), ...matrix[rotation].map(i32), be32(width * 65536), be32(height * 65536));
}
function mdhd(version: 0 | 1 = 0): Uint8Array {
  return version ? box("mdhd", full(1), be64(0n), be64(0n), be32(60_000), be64(6_000_000n), be16(0), be16(0)) : box("mdhd", full(), be32(0), be32(0), be32(60_000), be32(6_000_000), be16(0), be16(0));
}
function hdlr(handler: string): Uint8Array { return box("hdlr", full(), be32(0), text(handler), new Uint8Array(12), Uint8Array.of(0)); }
function colr(): Uint8Array { return box("colr", text("nclx"), be16(9), be16(16), be16(9), Uint8Array.of(0)); }
function hvcc(): Uint8Array { const p = new Uint8Array(22); p[0] = 1; p[17] = 2; return box("hvcC", p); }
function visualEntry(codec = "hvc1", width = 3840, height = 2160): Uint8Array {
  const fields = concat(new Uint8Array(6), be16(1), new Uint8Array(16), be16(width), be16(height), be32(0x00480000), be32(0x00480000), be32(0), be16(1), new Uint8Array(32), be16(24), be16(0xffff));
  return box(codec, fields, hvcc(), colr(), box("mdcv", new Uint8Array(24)), box("clli", new Uint8Array(4)));
}
function stsd(codec = "hvc1"): Uint8Array { return box("stsd", full(), be32(1), visualEntry(codec)); }
function stts(): Uint8Array { return box("stts", full(), be32(1), be32(6000), be32(1000)); }
function stsz(): Uint8Array { return box("stsz", full(), be32(1000), be32(6000)); }
function videoTrak(opts: FixtureOptions = {}, id = 1): Uint8Array {
  const stbl = box("stbl", stsd(opts.encrypted ? "encv" : opts.codec ?? "hvc1"), stts(), stsz(), ...(opts.encrypted ? [box("sinf", box("schm", new Uint8Array(8)))] : []));
  return box("trak", tkhd(opts.width ?? 3840, opts.height ?? 2160, opts.tkhdVersion ?? 0, opts.rotation ?? 0, id), box("mdia", mdhd(), hdlr("vide"), box("minf", stbl)));
}
function audioTrak(id = 2): Uint8Array { return box("trak", tkhd(0, 0, 0, 0, id), box("mdia", mdhd(), hdlr("soun"), box("minf", box("stbl", box("stsd", full(), be32(0)), stts(), stsz())))); }
function mvhd(): Uint8Array { return box("mvhd", full(), be32(0), be32(0), be32(1000), be32(100_000), new Uint8Array(80)); }

export interface FixtureOptions { width?: number; height?: number; rotation?: 0 | 90 | 180 | 270; tkhdVersion?: 0 | 1; codec?: string; multipleVideo?: boolean; fragmented?: boolean; encrypted?: boolean; extendedMdat?: boolean; zeroMdat?: boolean }

export function makeMp4(opts: FixtureOptions = {}): Uint8Array {
  const ftyp = box("ftyp", text("isom"), be32(0), text("isom"), text("mp42"));
  const moov = box("moov", mvhd(), videoTrak(opts), audioTrak(), ...(opts.multipleVideo ? [videoTrak(opts, 3)] : []), ...(opts.fragmented ? [box("mvex", new Uint8Array(8))] : []));
  const payload = Uint8Array.from({ length: 1024 }, (_, i) => i % 251);
  const mdat = opts.zeroMdat ? zeroBox("mdat", payload) : opts.extendedMdat ? extendedBox("mdat", payload) : box("mdat", payload);
  return concat(ftyp, moov, ...(opts.fragmented ? [box("moof", new Uint8Array(8))] : []), mdat);
}
