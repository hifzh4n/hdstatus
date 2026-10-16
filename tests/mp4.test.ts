import { describe, expect, it } from "vitest";
import { inspectMp4 } from "@/lib/mp4/parser";
import { patchDisplayDimensions, selectVideoTrack } from "@/lib/mp4/patch";
import { BufferSource } from "@/lib/mp4/source";
import { makeMp4 } from "./mp4-fixtures";

function asFile(bytes: Uint8Array): File {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return new File([copy], "fixture.mp4", { type: "video/mp4" });
}

describe("MP4 inspection", () => {
  it("distinguishes display dimensions from codec sample-entry dimensions", async () => {
    const result = await inspectMp4(new BufferSource(makeMp4({ width: 1280, height: 720 })));
    const video = selectVideoTrack(result);
    expect(video.displayWidth).toBe(1280); expect(video.displayHeight).toBe(720);
    expect(video.codedWidth).toBe(3840); expect(video.codedHeight).toBe(2160);
    expect(video.codec).toBe("hvc1"); expect(video.pixelFormat).toContain("10-bit");
    expect(video.hdr.kind).toBe("HDR10"); expect(video.hdr.masteringDisplay).toBe(true);
    expect(video.frameRate).toBe(60); expect(video.bitrate).toBe(480_000);
  });

  it.each([0, 1] as const)("parses tkhd version %s", async (tkhdVersion) => {
    const video = selectVideoTrack(await inspectMp4(new BufferSource(makeMp4({ tkhdVersion }))));
    expect(video.tkhd.version).toBe(tkhdVersion); expect(video.displayWidth).toBe(3840);
  });

  it("interprets portrait rotation without changing its matrix", async () => {
    const video = selectVideoTrack(await inspectMp4(new BufferSource(makeMp4({ width: 1920, height: 1080, rotation: 90 }))));
    expect(video.rotation).toBe(90); expect([video.displayWidth, video.displayHeight]).toEqual([1080, 1920]);
  });

  it("supports extended-size and terminal size-zero boxes", async () => {
    expect((await inspectMp4(new BufferSource(makeMp4({ extendedMdat: true })))).mdatRanges).toHaveLength(1);
    expect((await inspectMp4(new BufferSource(makeMp4({ zeroMdat: true })))).mdatRanges).toHaveLength(1);
  });

  it("finds tracks by handler and rejects ambiguous automatic selection", async () => {
    const result = await inspectMp4(new BufferSource(makeMp4({ multipleVideo: true })));
    expect(result.tracks.filter((t) => t.handler === "vide")).toHaveLength(2);
    expect(() => selectVideoTrack(result)).toThrow("Multiple video tracks");
  });

  it("flags fragmented and encrypted media", async () => {
    expect((await inspectMp4(new BufferSource(makeMp4({ fragmented: true })))).fragmented).toBe(true);
    expect((await inspectMp4(new BufferSource(makeMp4({ encrypted: true })))).encrypted).toBe(true);
  });

  it("rejects truncated and invalid structures", async () => {
    const valid = makeMp4();
    await expect(inspectMp4(new BufferSource(valid.slice(0, valid.length - 100)))).rejects.toThrow(/Invalid mdat size|Truncated/);
    await expect(inspectMp4(new BufferSource(Uint8Array.of(0, 0, 0, 4, 102, 116, 121, 112)))).rejects.toThrow(/Invalid ftyp size/);
  });
});

describe("tkhd patching", () => {
  it("changes only 8 bytes while preserving mdat and codec metadata", async () => {
    const original = makeMp4(); const file = asFile(original);
    const before = await inspectMp4(new BufferSource(original));
    const patched = await patchDisplayDimensions(file, before, 640, 360);
    const output = new Uint8Array(await patched.blob.arrayBuffer());
    const after = await inspectMp4(new BufferSource(output));
    const a = selectVideoTrack(before); const b = selectVideoTrack(after);
    expect([b.displayWidth, b.displayHeight]).toEqual([640, 360]);
    expect([b.codedWidth, b.codedHeight, b.codec, b.hdr.kind]).toEqual([a.codedWidth, a.codedHeight, a.codec, a.hdr.kind]);
    const changed = original.reduce<number[]>((indices, byte, i) => { if (byte !== output[i]) indices.push(i); return indices; }, []);
    expect(changed.every((i) => i >= a.tkhd.widthOffset && i < a.tkhd.heightOffset + 4)).toBe(true);
    const range = before.mdatRanges[0]; expect(output.slice(range.start, range.end)).toEqual(original.slice(range.start, range.end));
  });

  it("swaps stored dimensions for 90-degree rotation", async () => {
    const bytes = makeMp4({ rotation: 90 }); const inspection = await inspectMp4(new BufferSource(bytes));
    const patched = await patchDisplayDimensions(asFile(bytes), inspection, 360, 640);
    expect([patched.storedWidth, patched.storedHeight]).toEqual([640, 360]);
    const video = selectVideoTrack(await inspectMp4(new BufferSource(new Uint8Array(await patched.blob.arrayBuffer()))));
    expect([video.displayWidth, video.displayHeight]).toEqual([360, 640]);
  });

  it("fails safely for fragmented, encrypted, or invalid target inputs", async () => {
    for (const opts of [{ fragmented: true }, { encrypted: true }]) {
      const bytes = makeMp4(opts); const result = await inspectMp4(new BufferSource(bytes));
      await expect(patchDisplayDimensions(asFile(bytes), result, 640, 360)).rejects.toThrow();
    }
    const bytes = makeMp4(); const result = await inspectMp4(new BufferSource(bytes));
    await expect(patchDisplayDimensions(asFile(bytes), result, -1, 0)).rejects.toThrow();
  });
});
