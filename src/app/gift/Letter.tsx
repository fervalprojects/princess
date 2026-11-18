"use client";

import { useEffect, useMemo, useState } from "react";

interface LetterProps {
  title: string;
  paragraphs: readonly string[];
  quote: string;
  onClose: () => void;
}

const TYPE_MS = 30;

export default function Letter({ title, paragraphs, quote, onClose }: LetterProps) {
  // Split by code points so emojis are never cut in half.
  const chars = useMemo(() => paragraphs.map((p) => Array.from(p)), [paragraphs]);
  const total = useMemo(() => chars.reduce((n, p) => n + p.length, 0), [chars]);
  const [shown, setShown] = useState(0);
  const done = shown >= total;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setInterval(
      () => setShown((n) => (n >= total ? n : n + (reduce ? total : 1))),
      TYPE_MS,
    );
    return () => window.clearInterval(id);
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const starts = chars.map((_, i) => chars.slice(0, i).reduce((n, p) => n + p.length, 0));
  const visible = chars.map((p, i) => {
    const take = Math.max(0, Math.min(p.length, shown - starts[i]));
    return { text: p.slice(0, take).join(""), started: take > 0, full: take === p.length };
  });
  const typingIndex = visible.findIndex((v) => !v.full);

  return (
    <div
      className="letter-backdrop fixed inset-0 z-30 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <article
        className="letter-paper relative max-h-[88vh] w-full max-w-md overflow-y-auto px-7 pb-8 pt-9 text-center sm:px-10"
        onClick={(e) => {
          e.stopPropagation();
          setShown(total); // tap the letter to skip the typing
        }}
      >
        <span className="corner corner-tl" aria-hidden />
        <span className="corner corner-tr" aria-hidden />
        <span className="corner corner-bl" aria-hidden />
        <span className="corner corner-br" aria-hidden />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-xl leading-none text-[#b48a3c] transition hover:bg-[#b48a3c]/10"
          aria-label="Cerrar carta"
        >
          ×
        </button>

        <div className="wax-seal mx-auto mb-4" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#f6d27a">
            <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.6.7-1.4 2.2-2.6 4.3-2.6 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
          </svg>
        </div>

        <h2 className="font-script text-4xl leading-tight text-[#27b3d6] sm:text-[2.6rem]">{title}</h2>

        <div className="my-4 flex items-center justify-center gap-3" aria-hidden>
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#d9b25f]" />
          <span className="text-xs text-[#c3112b]">♥</span>
          <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#d9b25f]" />
        </div>

        <div className="font-serif-letter space-y-2 text-[1.12rem] leading-relaxed text-[#4a3a33] sm:text-[1.2rem]">
          {visible.map((v, i) =>
            v.started ? (
              <p key={i}>
                {v.text}
                {i === typingIndex && <span className="type-caret" aria-hidden />}
              </p>
            ) : null,
          )}
        </div>

        <div className={`transition-opacity duration-700 ${done ? "opacity-100" : "opacity-0"}`}>
          <div className="mx-auto mt-6 h-px w-4/5 bg-gradient-to-r from-transparent via-[#e3cfa4] to-transparent" />
          <p className="font-serif-letter mt-4 text-lg italic text-[#27b3d6]">{quote}</p>
        </div>
      </article>
    </div>
  );
}
