"use client";

export type StreamOption = { id: string; name: string; color: string };

type Props = {
  streams: StreamOption[];
  /** Stream the task is in now, drawn as a filled dot. */
  currentId?: string | null;
  /** Best guess for an unsorted task, drawn with a ring. */
  suggestedId?: string | null;
  /** Show 1–9 on the dots for keyboard sorting. */
  showKeys?: boolean;
  onPick: (streamId: string) => void;
  className?: string;
};

/** One tap files a task under a stream. */
export function StreamDots({
  streams,
  currentId,
  suggestedId,
  showKeys = false,
  onPick,
  className = "",
}: Props) {
  if (streams.length === 0) return null;
  return (
    <div className={`flex items-center gap-1 ${className}`} role="group" aria-label="Move to stream">
      {streams.map((s, i) => {
        const current = s.id === currentId;
        const suggested = !current && s.id === suggestedId;
        return (
          <button
            key={s.id}
            type="button"
            title={`${s.name}${showKeys && i < 9 ? ` (${i + 1})` : ""}`}
            aria-label={`Move to ${s.name}`}
            aria-pressed={current}
            onClick={() => onPick(s.id)}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-line/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold leading-none text-paper"
              style={{
                backgroundColor: current || suggested ? s.color : "transparent",
                border: `2px solid ${s.color}`,
                boxShadow: suggested ? `0 0 0 2px var(--paper), 0 0 0 3.5px ${s.color}` : undefined,
              }}
            >
              {showKeys && i < 9 && (current || suggested) ? i + 1 : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Small colored dot + name, used as a stream label on cards. */
export function StreamTag({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 normal-case tracking-normal">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span style={{ color }}>{name}</span>
    </span>
  );
}

/**
 * Guess a stream for an unsorted title from words its existing tasks use.
 * Returns null unless one stream clearly wins.
 */
export function guessStream(
  title: string,
  streams: (StreamOption & { titles: string[] })[],
): string | null {
  const words = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4),
    );
  const target = words(title);
  if (target.size === 0) return null;
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const s of streams) {
    const vocab = words([s.name, ...s.titles].join(" "));
    let score = 0;
    for (const w of target) if (vocab.has(w)) score += 1;
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { id: s.id, score };
      tie = false;
    } else if (score === best.score) {
      tie = true;
    }
  }
  return best && !tie ? best.id : null;
}
