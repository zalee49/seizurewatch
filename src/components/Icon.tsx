import type { ReactNode } from "react";

const paths = {
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="4" /><path d="M3 10h18M8 3v4m8-4v4m-9 7h2m3 0h2m-7 3h2" /></>,
  pill: <><path d="M9 4a6.4 6.4 0 0 1 9 9l-5 5a6.4 6.4 0 0 1-9-9Z" /><path d="m8 8 8 8m-4-9 3-3" /></>,
  flask: <><path d="M9 3h6m-5 0v6l-5.5 9A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L14 9V3M8 14h8" /><path d="M10 18h.01M14 17h.01" /></>,
  history: <><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" /><path d="M12 7v5l3 2" /></>,
  chart: <><path d="M4 3v17h17M8 14l4-5 4 3 5-7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  left: <path d="m14 6-6 6 6 6" />,
  right: <path d="m10 6 6 6-6 6" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="3" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

// Decorative by default: the accompanying text or control supplies the accessible name.
export default function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
