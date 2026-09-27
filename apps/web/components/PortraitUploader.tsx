"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const MAX_HEIGHT = 900;
const VIDEO_FRAMES = 16;

async function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, MAX_HEIGHT / h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode failed"))), "image/jpeg", 0.82),
  );
}

async function framesFromPhotos(files: File[]): Promise<Blob[]> {
  const sorted = [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  return Promise.all(
    sorted.map(async (f) => {
      const bmp = await createImageBitmap(f);
      return toJpeg(bmp, bmp.width, bmp.height);
    }),
  );
}

/** Evenly spaced frames from a turn-around video, decoded in the browser. */
async function framesFromVideo(file: File): Promise<Blob[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(file);
  await new Promise((ok, fail) => {
    video.onloadedmetadata = ok;
    video.onerror = () => fail(new Error("This video can't be read in the browser."));
  });
  const out: Blob[] = [];
  for (let i = 0; i < VIDEO_FRAMES; i++) {
    video.currentTime = (video.duration * (i + 0.5)) / VIDEO_FRAMES;
    await new Promise((ok) => (video.onseeked = ok));
    out.push(await toJpeg(video, video.videoWidth, video.videoHeight));
  }
  URL.revokeObjectURL(video.src);
  return out;
}

/** Pick photos (turning in place, in order) or one short video; frames are resized and uploaded. */
export function PortraitUploader({ hasPortrait }: { hasPortrait: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: File[]) {
    setBusy(true);
    try {
      const video = files.find((f) => f.type.startsWith("video/"));
      setStatus(video ? "Reading the video…" : "Preparing photos…");
      const frames = video
        ? await framesFromVideo(video)
        : await framesFromPhotos(files.filter((f) => f.type.startsWith("image/")).slice(0, 36));
      if (frames.length === 0) throw new Error("Choose photos or a video.");
      for (let i = 0; i < frames.length; i++) {
        setStatus(`Uploading ${i + 1} of ${frames.length}…`);
        const res = await fetch(`/api/portrait/frames/${i}`, { method: "PUT", body: frames[i] });
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => null))?.error ?? `Upload failed (${res.status})`,
          );
      }
      await fetch(`/api/portrait?from=${frames.length}`, { method: "DELETE" }); // drop leftovers of an older, longer set
      setStatus(`Done: ${frames.length} frame${frames.length === 1 ? "" : "s"}.`);
      router.refresh();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => e.target.files?.length && upload([...e.target.files])}
      />
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-md bg-accent px-4 py-2 font-mono text-xs tracking-[0.15em] text-stone-950 uppercase hover:bg-accent/85 disabled:opacity-50"
        >
          {hasPortrait ? "Replace portrait" : "Upload portrait"}
        </button>
        {hasPortrait && (
          <button
            disabled={busy}
            onClick={async () => {
              if (!confirm("Delete your portrait?")) return;
              await fetch("/api/portrait", { method: "DELETE" });
              router.refresh();
            }}
            className="rounded-md px-4 py-2 font-mono text-xs tracking-[0.15em] text-stone-400 uppercase ring-1 ring-stone-700 hover:text-alert"
          >
            Delete
          </button>
        )}
      </div>
      {status && <p className="font-mono text-xs text-stone-400">{status}</p>}
      <p className="text-sm text-stone-400">
        For the 360° view, take 8–16 photos while turning slowly in place (same distance, same
        light), or film a 5–10 second turn. One photo works too. Photos stay private: only you,
        signed in, can see them.
      </p>
    </div>
  );
}
