import type { DownloadPhase } from "@/src/types/download";
import { getBackendUrl } from "@/src/services/providers/backendProvider";
import type { AudioFileFormat, DownloadableSong } from "@/src/types/music";

type JobStatus = { id: string; status: "preparing" | "ready" | "failed"; detail?: string; extension?: AudioFileFormat; progress?: DownloadPhase };

async function request(path: string, signal: AbortSignal, options?: RequestInit): Promise<JobStatus> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort);
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const url = await getBackendUrl();
    const response = await fetch(`${url}${path}`, { ...options, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 404 && options?.method === "POST") throw new Error("Restart the Tempo backend to enable prepared downloads.");
      throw new Error(typeof data.detail === "string" ? data.detail : `Backend request failed (${response.status}).`);
    }
    return data as JobStatus;
  } catch (error) {
    if (signal.aborted) throw new Error("Download cancelled.");
    if (controller.signal.aborted) throw new Error("The backend did not respond. Check the server and retry.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

function wait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new Error("Download cancelled.")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
    signal.addEventListener("abort", abort);
    if (signal.aborted) abort();
  });
}

export async function discardPreparedDownload(id: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = await getBackendUrl();
    await fetch(`${url}/api/downloads/${encodeURIComponent(id)}`, { method: "DELETE", signal: controller.signal });
  } catch { /* Server expiry also cleans up when connectivity is lost. */ }
  finally { clearTimeout(timeout); }
}

export async function prepareDownload(song: DownloadableSong, signal: AbortSignal, onPhase?: (phase: DownloadPhase) => void) {
  let id: string | undefined;
  try {
    const job = await request("/api/downloads", signal, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: song.sourceUrl, format: song.format === "original" ? "original" : "mp3", quality: song.quality ?? 192, authorized: true }),
    });
    id = job.id;
    if (!id) throw new Error("The backend returned an invalid download job.");
    const deadline = Date.now() + 6 * 60 * 1000;
    while (Date.now() < deadline) {
      const state = await request(`/api/downloads/${encodeURIComponent(id)}`, signal);
      if (state.progress) onPhase?.(state.progress);
      if (state.status === "failed") throw new Error(state.detail ?? "Audio conversion failed.");
      if (state.status === "ready") {
        const extension = state.extension;
        if (!extension || !["mp3", "m4a", "webm", "opus", "ogg", "flac", "wav", "aac"].includes(extension)) throw new Error("The backend returned an unsupported audio format. Restart the backend and retry.");
        return { id, extension, url: `${await getBackendUrl()}/api/downloads/${encodeURIComponent(id)}/file` };
      }
      await wait(signal);
    }
    throw new Error("Audio preparation timed out. Please retry.");
  } catch (error) {
    if (id) await discardPreparedDownload(id);
    throw error;
  }
}
