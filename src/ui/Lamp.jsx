// The hurricane lamp: the kerosene lantern many Nigerian families told stories by when the
// light went out. Its flame and glow follow the speaker's voice while recording (--level,
// 0 to 1, set straight on the element so Preact does not re-render 30 times a second).
import { useEffect, useRef } from "preact/hooks";

export function Lamp({ state = "idle", level = null, big = false, label = "", playful = false }) {
  const ref = useRef(null);
  // on the home screen, a tap blows on the flame; it dips and comes back
  const puff = () => {
    const el = ref.current;
    if (!playful || !el) return;
    el.classList.remove("puff");
    void el.offsetWidth;
    el.classList.add("puff");
  };
  useEffect(() => {
    if (!level) return;
    // level is a function the recorder calls; it writes the CSS variable directly
    level.current = (v) => ref.current?.style.setProperty("--level", v.toFixed(3));
    return () => (level.current = null);
  }, [level]);
  return (
    <div ref={ref} onClick={puff} onAnimationEnd={(e) => e.animationName === "puff" && ref.current?.classList.remove("puff")} class={`lamp ${state} ${big ? "big" : ""} ${playful ? "playful" : ""}`} role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"}>
      <div class="glow" />
      <svg viewBox="0 0 120 160" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        {/* handle */}
        <path d="M34 34 C34 6, 86 6, 86 34" />
        {/* top cap */}
        <path d="M38 34 H82 L76 44 H44 Z" fill="var(--bg)" />
        {/* glass globe */}
        <path d="M44 46 C26 62, 26 104, 44 118 H76 C94 104, 94 62, 76 46 Z" fill="var(--bg)" opacity="0.6" />
        {/* the flame */}
        <path class="flame" d="M60 70 C67 80, 69 88, 66 96 C64 101, 56 101, 54 96 C51 88, 53 80, 60 70 Z" fill="var(--lamp)" stroke="none" />
        <path d="M58 99 V106 M62 99 V106" stroke-width="2" />
        {/* guard wires */}
        <path d="M50 46 C42 66, 42 98, 50 118 M70 46 C78 66, 78 98, 70 118" stroke-width="2" opacity="0.7" />
        {/* the tank */}
        <path d="M40 118 H80 L88 134 C88 142, 32 142, 32 134 Z" fill="var(--bg)" />
        <path d="M30 146 H90" />
      </svg>
    </div>
  );
}
