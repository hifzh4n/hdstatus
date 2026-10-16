# StatusHD

A small browser tool with one job:

1. Upload an MP4, MOV, or M4V file (including iPhone QuickTime video).
2. The app automatically derives spoofed display dimensions from its original aspect ratio.
3. Download the metadata-spoofed MP4.

The original coded resolution and container type remain unchanged. An iPhone `.MOV` is downloaded as `.MOV`; it is not renamed or converted to MP4. The app fits the visible aspect ratio inside a 640-pixel long edge—for example, 3840×2160 becomes an advertised 640×360 and 2160×3840 becomes 360×640—then changes only the video track's `tkhd` display width and height. It does not decode or re-encode video or audio. Before exposing the download, it computes SHA-256 over every `mdat` box in the input and output and requires the hashes to match.

## Run locally

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## GitHub Pages

The `main` branch automatically builds and deploys through GitHub Actions. After selecting **GitHub Actions** under the repository's **Settings → Pages → Source**, the site is available at:

[https://hifzh4n.github.io/hdstatus/](https://hifzh4n.github.io/hdstatus/)

## Verify the project

```powershell
npm test
npm run lint
npm run build
```

The parser supports normal and extended-size boxes, terminal size-zero boxes, `tkhd` versions 0 and 1, and rotated video. It rejects malformed, fragmented, encrypted, zero-video-track, and multi-video-track files instead of producing an uncertain output.

The result remains experimental. WhatsApp can read the actual AVC/HEVC coded dimensions or apply limits based on bitrate, frame rate, codec profile, duration, or file size, so changing display metadata may not prevent recompression. Send the downloaded MP4 through WhatsApp using its **Document** attachment option.
