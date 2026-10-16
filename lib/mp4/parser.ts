import { ascii, fixed1616, i32, u16, u32, u64 } from "./binary";
import { Mp4Error, type InspectionResult, type Mp4Box, type RandomAccessSource, type TrackInfo } from "./types";

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta", "meta", "ilst"]);
const MAX_BOXES = 100_000;
const MAX_DEPTH = 16;

function direct(box: Mp4Box, type: string): Mp4Box | undefined { return box.children.find((child) => child.type === type); }
function descend(box: Mp4Box, ...types: string[]): Mp4Box | undefined {
  let current: Mp4Box | undefined = box;
  for (const type of types) current = current && direct(current, type);
  return current;
}
function allBoxes(boxes: Mp4Box[]): Mp4Box[] { return boxes.flatMap((box) => [box, ...allBoxes(box.children)]); }

async function scan(source: RandomAccessSource, start: number, end: number, parentPath: string, depth: number, counter: { n: number }): Promise<Mp4Box[]> {
  if (depth > MAX_DEPTH) throw new Mp4Error("MP4 box nesting is too deep", "DEPTH_LIMIT");
  const boxes: Mp4Box[] = [];
  let position = start;
  while (position < end) {
    if (end - position < 8) throw new Mp4Error(`Truncated box header at byte ${position}`, "TRUNCATED");
    if (++counter.n > MAX_BOXES) throw new Mp4Error("MP4 contains too many boxes", "BOX_LIMIT");
    const head = await source.read(position, Math.min(16, end - position));
    const size32 = u32(head, 0);
    const type = ascii(head, 4, 4);
    if (!/^[\x20-\x7e]{4}$/.test(type)) throw new Mp4Error(`Invalid box type at byte ${position}`, "INVALID_TYPE");
    let headerSize = 8;
    let size: number;
    if (size32 === 1) {
      if (head.length < 16) throw new Mp4Error(`Truncated extended-size box ${type}`, "TRUNCATED");
      const big = u64(head, 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Mp4Error(`${type} exceeds JavaScript's safe file size`, "SIZE_LIMIT");
      size = Number(big);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - position;
    } else size = size32;
    if (size < headerSize || position + size > end) throw new Mp4Error(`Invalid ${type} size ${size} at byte ${position}`, "INVALID_SIZE");
    const path = `${parentPath}/${type}`;
    const box: Mp4Box = { type, start: position, size, headerSize, dataStart: position + headerSize, end: position + size, path, children: [] };
    if (CONTAINERS.has(type)) {
      let childStart = box.dataStart;
      if (type === "meta") childStart += 4;
      if (childStart > box.end) throw new Mp4Error(`Truncated ${type} box`, "TRUNCATED");
      box.children = await scan(source, childStart, box.end, path, depth + 1, counter);
    }
    boxes.push(box);
    position += size;
    if (size32 === 0) break;
  }
  return boxes;
}

async function readTkhd(source: RandomAccessSource, box: Mp4Box) {
  const versionByte = await source.read(box.dataStart, 1);
  const version = versionByte[0];
  if (version !== 0 && version !== 1) throw new Mp4Error(`Unsupported tkhd version ${version}`, "TKHD_VERSION");
  const required = version === 0 ? 84 : 96;
  if (box.end - box.dataStart < required) throw new Mp4Error("Truncated tkhd box", "TRUNCATED");
  const bytes = await source.read(box.dataStart, required);
  const idOffset = version === 0 ? 12 : 20;
  const matrixOffset = version === 0 ? 40 : 52;
  const widthOffset = version === 0 ? 76 : 88;
  const heightOffset = widthOffset + 4;
  const a = i32(bytes, matrixOffset) / 65536;
  const b = i32(bytes, matrixOffset + 4) / 65536;
  const c = i32(bytes, matrixOffset + 12) / 65536;
  const d = i32(bytes, matrixOffset + 16) / 65536;
  const near = (n: number, target: number) => Math.abs(n - target) < 0.001;
  let rotation: 0 | 90 | 180 | 270 | null = null;
  if (near(a, 1) && near(b, 0) && near(c, 0) && near(d, 1)) rotation = 0;
  else if (near(a, 0) && near(b, 1) && near(c, -1) && near(d, 0)) rotation = 90;
  else if (near(a, -1) && near(b, 0) && near(c, 0) && near(d, -1)) rotation = 180;
  else if (near(a, 0) && near(b, -1) && near(c, 1) && near(d, 0)) rotation = 270;
  return {
    id: u32(bytes, idOffset), rotation,
    storedWidth: fixed1616(u32(bytes, widthOffset)), storedHeight: fixed1616(u32(bytes, heightOffset)),
    version: version as 0 | 1, widthOffset: box.dataStart + widthOffset, heightOffset: box.dataStart + heightOffset,
  };
}

async function handlerType(source: RandomAccessSource, hdlr: Mp4Box): Promise<string> {
  if (hdlr.end - hdlr.dataStart < 12) throw new Mp4Error("Truncated hdlr box", "TRUNCATED");
  return ascii(await source.read(hdlr.dataStart + 8, 4), 0, 4);
}

async function mediaTiming(source: RandomAccessSource, mdhd?: Mp4Box) {
  if (!mdhd) return { timescale: 0, duration: 0 };
  const version = (await source.read(mdhd.dataStart, 1))[0];
  const needed = version === 1 ? 32 : 20;
  if (version !== 0 && version !== 1 || mdhd.end - mdhd.dataStart < needed) throw new Mp4Error("Invalid mdhd box", "TRUNCATED");
  const bytes = await source.read(mdhd.dataStart, needed);
  return version === 1
    ? { timescale: u32(bytes, 20), duration: Number(u64(bytes, 24)) }
    : { timescale: u32(bytes, 12), duration: u32(bytes, 16) };
}

async function sampleStats(source: RandomAccessSource, stbl?: Mp4Box) {
  const stsz = stbl && direct(stbl, "stsz");
  const stts = stbl && direct(stbl, "stts");
  let sampleCount: number | null = null;
  let totalBytes: number | null = null;
  let totalTicks: number | null = null;
  if (stsz && stsz.end - stsz.dataStart >= 12) {
    const head = await source.read(stsz.dataStart, 12);
    const uniformSize = u32(head, 4);
    sampleCount = u32(head, 8);
    if (sampleCount > 100_000_000) throw new Mp4Error("Unreasonable sample count", "SAMPLE_LIMIT");
    if (uniformSize) totalBytes = uniformSize * sampleCount;
    else {
      const needed = sampleCount * 4;
      if (stsz.end - (stsz.dataStart + 12) < needed) throw new Mp4Error("Truncated stsz table", "TRUNCATED");
      totalBytes = 0;
      const chunk = 16_384;
      for (let offset = 0; offset < needed; offset += chunk) {
        const bytes = await source.read(stsz.dataStart + 12 + offset, Math.min(chunk, needed - offset));
        for (let i = 0; i < bytes.length; i += 4) totalBytes += u32(bytes, i);
      }
    }
  }
  if (stts && stts.end - stts.dataStart >= 8) {
    const head = await source.read(stts.dataStart, 8);
    const entries = u32(head, 4);
    if (entries > 1_000_000 || stts.end - (stts.dataStart + 8) < entries * 8) throw new Mp4Error("Invalid stts table", "TRUNCATED");
    const bytes = await source.read(stts.dataStart + 8, entries * 8);
    totalTicks = 0;
    let countedSamples = 0;
    for (let i = 0; i < entries; i += 1) { countedSamples += u32(bytes, i * 8); totalTicks += u32(bytes, i * 8) * u32(bytes, i * 8 + 4); }
    if (sampleCount === null) sampleCount = countedSamples;
  }
  return { sampleCount, totalBytes, totalTicks };
}

const COLOR_PRIMARIES: Record<number, string> = { 1: "BT.709", 9: "BT.2020" };
const TRANSFERS: Record<number, string> = { 1: "BT.709", 14: "BT.2020 10-bit", 15: "BT.2020 12-bit", 16: "SMPTE ST 2084 (PQ)", 18: "ARIB STD-B67 (HLG)" };
const MATRICES: Record<number, string> = { 1: "BT.709", 9: "BT.2020 non-constant luminance", 10: "BT.2020 constant luminance" };

async function sampleDescription(source: RandomAccessSource, stsd?: Mp4Box) {
  const empty = { codec: "unknown", width: null as number | null, height: null as number | null, primaries: null as string | null, transfer: null as string | null, matrix: null as string | null, fullRange: null as boolean | null, mdcv: false, clli: false, bitDepth: null as number | null };
  if (!stsd || stsd.end - stsd.dataStart < 16) return empty;
  const head = await source.read(stsd.dataStart, 16);
  const count = u32(head, 4);
  if (!count) return empty;
  const entryStart = stsd.dataStart + 8;
  const entryHead = await source.read(entryStart, Math.min(86, stsd.end - entryStart));
  if (entryHead.length < 8) throw new Mp4Error("Truncated sample entry", "TRUNCATED");
  const entrySize = u32(entryHead, 0);
  const codec = ascii(entryHead, 4, 4);
  if (entrySize < 8 || entryStart + entrySize > stsd.end) throw new Mp4Error("Invalid sample entry size", "INVALID_SIZE");
  const visual = ["avc1", "avc3", "hvc1", "hev1", "dvhe", "dvh1", "encv"].includes(codec);
  if (!visual || entryHead.length < 86) return { ...empty, codec };
  const width = u16(entryHead, 32);
  const height = u16(entryHead, 34);
  let primaries: string | null = null, transfer: string | null = null, matrix: string | null = null, fullRange: boolean | null = null;
  let mdcv = false, clli = false, bitDepth: number | null = null;
  // VisualSampleEntry is 86 bytes including its own 8-byte box header.
  let pos = entryStart + 86;
  while (pos + 8 <= entryStart + entrySize) {
    const childHead = await source.read(pos, Math.min(16, entryStart + entrySize - pos));
    let childSize = u32(childHead, 0);
    const childType = ascii(childHead, 4, 4);
    let childHeader = 8;
    if (childSize === 1) { childSize = Number(u64(childHead, 8)); childHeader = 16; }
    if (childSize < childHeader || pos + childSize > entryStart + entrySize) break;
    if (childType === "colr" && childSize >= childHeader + 11) {
      const colr = await source.read(pos + childHeader, 11);
      if (ascii(colr, 0, 4) === "nclx") {
        primaries = COLOR_PRIMARIES[u16(colr, 4)] ?? `ISO ${u16(colr, 4)}`;
        transfer = TRANSFERS[u16(colr, 6)] ?? `ISO ${u16(colr, 6)}`;
        matrix = MATRICES[u16(colr, 8)] ?? `ISO ${u16(colr, 8)}`;
        fullRange = Boolean(colr[10] & 0x80);
      }
    }
    if (childType === "mdcv") mdcv = true;
    if (childType === "clli") clli = true;
    if (childType === "hvcC" && childSize >= childHeader + 22) {
      const hvcc = await source.read(pos + childHeader, 22);
      bitDepth = 8 + (hvcc[17] & 7);
    }
    pos += childSize;
  }
  return { codec, width, height, primaries, transfer, matrix, fullRange, mdcv, clli, bitDepth };
}

async function movieDuration(source: RandomAccessSource, moov: Mp4Box): Promise<number | null> {
  const mvhd = direct(moov, "mvhd");
  if (!mvhd) return null;
  const version = (await source.read(mvhd.dataStart, 1))[0];
  const needed = version === 1 ? 32 : 20;
  if ((version !== 0 && version !== 1) || mvhd.end - mvhd.dataStart < needed) return null;
  const bytes = await source.read(mvhd.dataStart, needed);
  const timescale = u32(bytes, version === 1 ? 20 : 12);
  const duration = version === 1 ? Number(u64(bytes, 24)) : u32(bytes, 16);
  return timescale ? duration / timescale : null;
}

async function fileType(source: RandomAccessSource, ftyp?: Mp4Box) {
  if (!ftyp || ftyp.end - ftyp.dataStart < 8) return { major: null, compatible: [] as string[] };
  const bytes = await source.read(ftyp.dataStart, ftyp.end - ftyp.dataStart);
  const compatible: string[] = [];
  for (let i = 8; i + 4 <= bytes.length; i += 4) compatible.push(ascii(bytes, i, 4));
  return { major: ascii(bytes, 0, 4), compatible };
}

export async function inspectMp4(source: RandomAccessSource): Promise<InspectionResult> {
  if (source.size < 8) throw new Mp4Error("File is too small to be an MP4", "TRUNCATED");
  const boxes = await scan(source, 0, source.size, "", 0, { n: 0 });
  const ftyp = boxes.find((box) => box.type === "ftyp");
  const moov = boxes.find((box) => box.type === "moov");
  if (!ftyp) throw new Mp4Error("Missing ftyp box; this is not a supported MP4", "NO_FTYP");
  if (!moov) throw new Mp4Error("Missing moov box", "NO_MOOV");
  const flat = allBoxes(boxes);
  const fragmented = flat.some((box) => box.type === "moof" || box.type === "mvex");
  const encrypted = flat.some((box) => ["sinf", "schm", "tenc", "pssh"].includes(box.type));
  const warnings: string[] = [];
  if (fragmented) warnings.push("Fragmented MP4 detected. Metadata spoofing is disabled.");
  if (encrypted) warnings.push("Encrypted/protected media detected. Processing is disabled.");
  const tracks: TrackInfo[] = [];
  for (const trak of moov.children.filter((box) => box.type === "trak")) {
    const tkhdBox = direct(trak, "tkhd");
    const hdlr = descend(trak, "mdia", "hdlr");
    if (!tkhdBox || !hdlr) throw new Mp4Error("Track lacks required tkhd or hdlr box", "INVALID_TRACK");
    const handler = await handlerType(source, hdlr);
    const tkhd = await readTkhd(source, tkhdBox);
    const timing = await mediaTiming(source, descend(trak, "mdia", "mdhd"));
    const stbl = descend(trak, "mdia", "minf", "stbl");
    const stats = await sampleStats(source, stbl);
    const desc = await sampleDescription(source, stbl && direct(stbl, "stsd"));
    const durationSeconds = timing.timescale ? timing.duration / timing.timescale : null;
    const displaySwapped = tkhd.rotation === 90 || tkhd.rotation === 270;
    const hdrKind = desc.codec.startsWith("dv") ? "Dolby Vision" : desc.transfer?.includes("2084") && desc.primaries === "BT.2020" ? "HDR10" : desc.transfer?.includes("HLG") ? "HLG" : desc.transfer || desc.mdcv || desc.clli ? "HDR-signaled" : desc.primaries ? "SDR" : "Unknown";
    tracks.push({
      id: tkhd.id, handler, codec: desc.codec,
      codedWidth: desc.width, codedHeight: desc.height,
      storedDisplayWidth: tkhd.storedWidth, storedDisplayHeight: tkhd.storedHeight,
      displayWidth: displaySwapped ? tkhd.storedHeight : tkhd.storedWidth,
      displayHeight: displaySwapped ? tkhd.storedWidth : tkhd.storedHeight,
      rotation: tkhd.rotation,
      durationSeconds,
      frameRate: stats.sampleCount !== null && stats.totalTicks ? stats.sampleCount * timing.timescale / stats.totalTicks : null,
      bitrate: stats.totalBytes !== null && durationSeconds ? stats.totalBytes * 8 / durationSeconds : null,
      sampleCount: stats.sampleCount,
      pixelFormat: desc.bitDepth ? `${desc.bitDepth}-bit (chroma format requires bitstream probe)` : null,
      colorPrimaries: desc.primaries, transferCharacteristics: desc.transfer, matrixCoefficients: desc.matrix, fullRange: desc.fullRange,
      hdr: { kind: hdrKind, masteringDisplay: desc.mdcv, contentLightLevel: desc.clli },
      tkhd: { version: tkhd.version, widthOffset: tkhd.widthOffset, heightOffset: tkhd.heightOffset },
    });
  }
  if (!tracks.some((track) => track.handler === "vide")) warnings.push("No video track was found.");
  const type = await fileType(source, ftyp);
  return {
    majorBrand: type.major, compatibleBrands: type.compatible,
    durationSeconds: await movieDuration(source, moov), fragmented, encrypted, tracks, boxes,
    mdatRanges: boxes.filter((box) => box.type === "mdat").map((box) => ({ start: box.start, end: box.end, dataStart: box.dataStart })),
    warnings,
  };
}
