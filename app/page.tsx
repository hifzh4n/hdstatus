"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, FileVideo, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { hashBlobRanges } from "@/lib/mp4/hash";
import { inspectMp4 } from "@/lib/mp4/parser";
import { patchDisplayDimensions } from "@/lib/mp4/patch";
import { BlobSource } from "@/lib/mp4/source";
import { automaticAdvertisedSize } from "@/lib/spoof-size";
import { formatBytes } from "@/lib/utils";

type Result = {
  blob: Blob;
  name: string;
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
  size: number;
  hash: string;
};

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function spoof(candidate: File) {
    setFile(candidate);
    setResult(null);
    setError(null);
    setBusy(true);
    setProgress(0.05);

    try {
      if (!candidate.name.toLowerCase().endsWith(".mp4") && candidate.type !== "video/mp4" && candidate.type !== "application/octet-stream") {
        throw new Error("This tool accepts MP4 video files only.");
      }

      const inspection = await inspectMp4(new BlobSource(candidate));
      setProgress(0.2);
      if (inspection.fragmented) throw new Error("Fragmented MP4 files are not supported.");
      if (inspection.encrypted) throw new Error("Encrypted MP4 files are not supported.");

      const videos = inspection.tracks.filter((track) => track.handler === "vide");
      if (videos.length !== 1) throw new Error(videos.length === 0 ? "No video track was found." : "Files with multiple video tracks are not supported.");

      const track = videos[0];
      const rotated = track.rotation === 90 || track.rotation === 270;
      const codedWidth = track.codedWidth ?? track.displayWidth;
      const codedHeight = track.codedHeight ?? track.displayHeight;
      const originalWidth = rotated ? codedHeight : codedWidth;
      const originalHeight = rotated ? codedWidth : codedHeight;
      const target = automaticAdvertisedSize(originalWidth, originalHeight);
      const patched = await patchDisplayDimensions(candidate, inspection, target.width, target.height);
      const ranges = inspection.mdatRanges.map(({ start, end }) => ({ start, end }));
      const originalHash = await hashBlobRanges(candidate, ranges, (value) => setProgress(0.2 + value * 0.35));
      const outputHash = await hashBlobRanges(patched.blob, ranges, (value) => setProgress(0.55 + value * 0.4));
      if (originalHash !== outputHash) throw new Error("Verification failed. No output was created.");

      setResult({
        blob: patched.blob,
        name: `${candidate.name.replace(/\.mp4$/i, "")}-spoofed-${target.width}x${target.height}.mp4`,
        originalWidth,
        originalHeight,
        targetWidth: target.width,
        targetHeight: target.height,
        size: patched.blob.size,
        hash: outputHash,
      });
      setProgress(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The video could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(45,212,191,.12),_transparent_42%)] px-5 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-7 text-center">
          <div className="text-sm font-bold uppercase tracking-[.25em] text-teal-300">StatusHD</div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Upload. Spoof. Download.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Changes only the MP4 display-size metadata. Your encoded video and audio stay untouched.</p>
        </div>

        <Card className="p-5 sm:p-6">
          {!file && (
            <button
                className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-5 py-14 text-center transition hover:border-teal-500 hover:bg-teal-950/20"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); const dropped = event.dataTransfer.files[0]; if (dropped) void spoof(dropped); }}
              >
                <Upload className="mb-4 text-teal-300" size={30} />
                <span className="font-semibold">Choose MP4 document</span>
                <span className="mt-2 text-xs text-slate-500">or drag and drop it here</span>
            </button>
          )}

          <input ref={inputRef} className="hidden" type="file" accept=".mp4,video/mp4,application/octet-stream" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void spoof(selected); }} />

          {file && busy && (
            <div className="py-10 text-center">
              <LoaderCircle className="mx-auto animate-spin text-teal-300" size={36} />
              <div className="mt-4 font-semibold">Spoofing and verifying…</div>
              <div className="mx-auto mt-5 h-2 max-w-sm overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-teal-300 transition-all" style={{ width: `${Math.max(5, progress * 100)}%` }} /></div>
              <div className="mt-2 text-xs text-slate-500">{Math.round(progress * 100)}%</div>
            </div>
          )}

          {file && !busy && result && (
            <div className="text-center">
              <CheckCircle2 className="mx-auto text-emerald-300" size={42} />
              <h2 className="mt-3 text-xl font-bold">Your video is ready</h2>
              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left">
                <div className="flex items-center gap-3"><FileVideo className="shrink-0 text-teal-300" /><div className="min-w-0"><div className="truncate text-sm font-semibold">{result.name}</div><div className="mt-1 text-xs text-slate-500">{formatBytes(result.size)}</div></div></div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-slate-500">Actual video</div><div className="mt-1 font-semibold">{result.originalWidth} × {result.originalHeight}</div></div>
                  <div><div className="text-xs text-slate-500">Advertised as</div><div className="mt-1 font-semibold text-teal-300">{result.targetWidth} × {result.targetHeight}</div></div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={14} />Encoded media verified unchanged</div>
              <Button className="mt-5 w-full py-3" onClick={download}><Download className="mr-2 inline" size={17} />Download spoofed MP4</Button>
              <Button className="mt-2 w-full" variant="ghost" onClick={reset}><RotateCcw className="mr-2 inline" size={16} />Process another video</Button>
              <div className="mt-4 break-all font-mono text-[9px] text-slate-700">mdat SHA-256: {result.hash}</div>
            </div>
          )}

          {file && !busy && error && (
            <div className="py-5 text-center"><div className="font-semibold text-red-300">Could not process this file</div><p className="mt-2 text-sm text-slate-400">{error}</p><Button className="mt-5" variant="secondary" onClick={reset}>Choose another MP4</Button></div>
          )}
        </Card>

        <p className="mt-5 text-center text-xs leading-5 text-slate-600">Send the downloaded MP4 through WhatsApp as a document. This is experimental—WhatsApp can still inspect the real codec dimensions and recompress it.</p>
      </div>
    </main>
  );
}
