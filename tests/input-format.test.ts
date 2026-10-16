import { describe, expect, it } from "vitest";
import { identifySupportedContainer } from "@/lib/input-format";

describe("supported Apple and ISO BMFF containers", () => {
  it.each([
    ["iphone.MOV", "video/quicktime", "mov", "video/quicktime"],
    ["clip.mov", "application/octet-stream", "mov", "video/quicktime"],
    ["clip.mp4", "video/mp4", "mp4", "video/mp4"],
    ["clip.M4V", "", "m4v", "video/mp4"],
  ])("accepts %s", (name, type, extension, mimeType) => {
    expect(identifySupportedContainer({ name, type })).toEqual({ extension, mimeType });
  });

  it("uses QuickTime MIME type when iOS omits the extension", () => {
    expect(identifySupportedContainer({ name: "video", type: "video/quicktime" })).toEqual({ extension: "mov", mimeType: "video/quicktime" });
  });

  it("rejects unrelated formats", () => {
    expect(identifySupportedContainer({ name: "video.webm", type: "video/webm" })).toBeNull();
  });
});
