import { toFixed1616, writeU32 } from "./binary";
import type { InspectionResult, TrackInfo } from "./types";

export interface PatchResult { blob: Blob; patches: Array<{ offset: number; before: number; after: number; field: "width" | "height" }>; storedWidth: number; storedHeight: number }

export function selectVideoTrack(inspection: InspectionResult): TrackInfo {
  const videos = inspection.tracks.filter((track) => track.handler === "vide");
  if (videos.length !== 1) throw new Error(videos.length ? "Multiple video tracks are not supported for automatic patching" : "No video track found");
  return videos[0];
}

export async function patchDisplayDimensions(file: File, inspection: InspectionResult, targetWidth: number, targetHeight: number, outputMimeType = "video/mp4"): Promise<PatchResult> {
  if (inspection.fragmented) throw new Error("Fragmented MP4 files are intentionally rejected");
  if (inspection.encrypted) throw new Error("Encrypted/protected MP4 files are intentionally rejected");
  if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) || targetWidth <= 0 || targetHeight <= 0 || targetWidth > 16384 || targetHeight > 16384) {
    throw new Error("Width and height must be whole numbers from 1 to 16384");
  }
  const track = selectVideoTrack(inspection);
  const swap = track.rotation === 90 || track.rotation === 270;
  const storedWidth = swap ? targetHeight : targetWidth;
  const storedHeight = swap ? targetWidth : targetHeight;
  const offsets = [track.tkhd.widthOffset, track.tkhd.heightOffset];
  if (offsets.some((offset) => offset < 0 || offset + 4 > file.size) || offsets[1] !== offsets[0] + 4) throw new Error("Unsafe tkhd patch offsets");
  const original = new Uint8Array(await file.slice(offsets[0], offsets[1] + 4).arrayBuffer());
  const patches = [
    { offset: offsets[0], before: new DataView(original.buffer).getUint32(0, false), after: toFixed1616(storedWidth), field: "width" as const },
    { offset: offsets[1], before: new DataView(original.buffer).getUint32(4, false), after: toFixed1616(storedHeight), field: "height" as const },
  ];
  const blob = new Blob([
    file.slice(0, offsets[0]), writeU32(patches[0].after), writeU32(patches[1].after), file.slice(offsets[1] + 4),
  ], { type: outputMimeType });
  if (blob.size !== file.size) throw new Error("Safety check failed: output size changed");
  return { blob, patches, storedWidth, storedHeight };
}
