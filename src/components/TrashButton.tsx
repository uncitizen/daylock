"use client";

type Props = {
  onClick: () => void;
  className?: string;
};

/** Compact, labeled trash control — icon for space, text for a11y. */
export function TrashButton({ onClick, className = "" }: Props) {
  return (
    <button
      type="button"
      aria-label="Move to trash"
      title="Move to trash"
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger ${className}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7h16" />
        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}
