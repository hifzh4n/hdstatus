import { describe, expect, it } from "vitest";
import { automaticAdvertisedSize } from "@/lib/spoof-size";

describe("automatic advertised dimensions", () => {
  it("maps 4K landscape to 640 × 360", () => {
    expect(automaticAdvertisedSize(3840, 2160)).toEqual({ width: 640, height: 360 });
  });

  it("maps 4K portrait to 360 × 640", () => {
    expect(automaticAdvertisedSize(2160, 3840)).toEqual({ width: 360, height: 640 });
  });

  it("does not upscale a smaller source", () => {
    expect(automaticAdvertisedSize(320, 180)).toEqual({ width: 320, height: 180 });
  });

  it("keeps generated dimensions even", () => {
    const result = automaticAdvertisedSize(1920, 817);
    expect(result.width).toBe(640);
    expect(result.height % 2).toBe(0);
  });
});
