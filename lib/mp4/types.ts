export interface RandomAccessSource {
  readonly size: number;
  read(start: number, length: number): Promise<Uint8Array>;
}

export interface Mp4Box {
  type: string;
  start: number;
  size: number;
  headerSize: number;
  dataStart: number;
  end: number;
  path: string;
  children: Mp4Box[];
}

export interface TrackInfo {
  id: number;
  handler: string;
  codec: string;
  codedWidth: number | null;
  codedHeight: number | null;
  storedDisplayWidth: number;
  storedDisplayHeight: number;
  displayWidth: number;
  displayHeight: number;
  rotation: 0 | 90 | 180 | 270 | null;
  durationSeconds: number | null;
  frameRate: number | null;
  bitrate: number | null;
  sampleCount: number | null;
  pixelFormat: string | null;
  colorPrimaries: string | null;
  transferCharacteristics: string | null;
  matrixCoefficients: string | null;
  fullRange: boolean | null;
  hdr: {
    kind: "HDR10" | "HLG" | "Dolby Vision" | "HDR-signaled" | "SDR" | "Unknown";
    masteringDisplay: boolean;
    contentLightLevel: boolean;
  };
  tkhd: { version: 0 | 1; widthOffset: number; heightOffset: number };
}

export interface InspectionResult {
  majorBrand: string | null;
  compatibleBrands: string[];
  durationSeconds: number | null;
  fragmented: boolean;
  encrypted: boolean;
  tracks: TrackInfo[];
  boxes: Mp4Box[];
  mdatRanges: Array<{ start: number; end: number; dataStart: number }>;
  warnings: string[];
}

export class Mp4Error extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "Mp4Error";
  }
}
