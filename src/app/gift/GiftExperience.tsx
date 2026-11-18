"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GIFT_CONFIG } from "./config";
import Letter from "./Letter";
import type { GiftPhase } from "./scene";

export default function GiftExperience() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [phase, setPhase] = useState<GiftPhase>("idle");
  const [letterOpen, setLetterOpen] = useState(false);
  const [hasMusic, setHasMusic] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    let fadeId = 0;

    // Load three.js only in the browser.
    import("./scene").then(({ createGiftScene }) => {
      if (disposed) return;
      const scene = createGiftScene(el, {
        ringText: GIFT_CONFIG.ringText,
        onPhase: (p) => {
          setPhase(p);
          if (p === "opening") {
            const a = new Audio(GIFT_CONFIG.music);
            a.loop = true;
            a.volume = 0;
            const start = Number((GIFT_CONFIG as { musicStart?: number }).musicStart);
            if (Number.isFinite(start) && start > 0) a.currentTime = start;
            audioRef.current = a;
            a.play()
              .then(() => {
                setHasMusic(true);
                // gentle fade-in over ~3 s
                fadeId = window.setInterval(() => {
                  a.volume = Math.min(0.6, a.volume + 0.02);
                  if (a.volume >= 0.6) window.clearInterval(fadeId);
                }, 100);
              })
              .catch(() => {
                /* no music file — that's fine */
              });
          }
        },
        onCardClick: () => setLetterOpen(true),
      });
      dispose = scene.dispose;
      setReady(true);
    });

    return () => {
      disposed = true;
      dispose?.();
      window.clearInterval(fadeId);
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggleMute = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(a.muted);
  }, []);

  const closeLetter = useCallback(() => setLetterOpen(false), []);

  const hint =
    phase === "idle" ? GIFT_CONFIG.hints.idle : phase === "open" && !letterOpen ? GIFT_CONFIG.hints.open : null;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0b0206] select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="loader-heart" aria-label="Cargando" />
        </div>
      )}

      {ready && hint && (
        <p
          key={hint}
          className="hint pointer-events-none absolute inset-x-0 bottom-[max(2.5rem,env(safe-area-inset-bottom))] px-6 text-center font-serif-letter text-2xl font-semibold tracking-wide text-pink-50 sm:text-3xl"
        >
          {hint}
        </p>
      )}

      {hasMusic && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-pink-200/30 bg-black/30 text-lg text-pink-100 backdrop-blur transition hover:bg-black/50"
          aria-label={muted ? "Activar música" : "Silenciar música"}
        >
          {muted ? "🔇" : "🎵"}
        </button>
      )}

      {letterOpen && (
        <Letter
          title={GIFT_CONFIG.letter.title}
          paragraphs={GIFT_CONFIG.letter.paragraphs}
          quote={GIFT_CONFIG.letter.quote}
          onClose={closeLetter}
        />
      )}
    </main>
  );
}
