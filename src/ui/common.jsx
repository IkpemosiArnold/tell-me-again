import { useEffect, useState } from "preact/hooks";
import { mb } from "../engine/models.js";

export function go(path) {
  location.hash = path;
}

export function back(fallback = "/") {
  if (history.length > 1 && document.referrer !== "" ? true : history.state !== null) history.back();
  else go(fallback);
}

export function Bar({ title, to = "/" }) {
  return (
    <div class="bar">
      <button class="icon-btn" aria-label="Back" onClick={() => go(to)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      {title ? <span class="title">{title}</span> : null}
    </div>
  );
}

export function Why({ label = "Why?", children }) {
  return (
    <details class="why">
      <summary>{label}</summary>
      {children}
    </details>
  );
}

/** Real progress with a way out. p: 0..1 or null (unknown). */
export function Progress({ label, p = null, detail = "", onStop, stopLabel = "Stop" }) {
  return (
    <div class="progress" role="status" aria-live="polite">
      <div class="row">
        <strong>{label}</strong>
        {p != null ? <span class="num">{Math.round(p * 100)}%</span> : null}
      </div>
      <div class={`meter ${p == null ? "indeterminate" : ""}`} style={{ "--p": p ?? 0 }}>
        <i />
      </div>
      <div class="row">
        <span class="num">{detail}</span>
        {onStop ? (
          <button class="btn quiet" onClick={onStop}>
            {stopLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const bytesDetail = ({ loaded, total }) => (total ? `${mb(loaded)} of ${mb(total)}` : mb(loaded));

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div class="error" role="alert">
      <strong>{error.message}</strong>
      {error.hint ? <span class="soft">{error.hint}</span> : null}
      {onRetry ? (
        <button class="link" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

let toastSet = null;
export function toast(text) {
  toastSet?.(text);
}
export function Toaster() {
  const [text, setText] = useState("");
  useEffect(() => {
    toastSet = (t) => setText(t);
    return () => (toastSet = null);
  }, []);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(""), 2600);
    return () => clearTimeout(t);
  }, [text]);
  return text ? (
    <div class="toast" role="status">
      {text}
    </div>
  ) : null;
}

/** Hold the screen awake while `on` (recording, writing down). */
export function useWakeLock(on) {
  useEffect(() => {
    if (!on || !navigator.wakeLock) return;
    let lock = null;
    let alive = true;
    const take = async () => {
      if (!alive || document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {}
    };
    const vis = () => take();
    document.addEventListener("visibilitychange", vis);
    take();
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", vis);
      lock?.release?.().catch(() => {});
    };
  }, [on]);
}

/** Save a Blob as a file. */
export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
