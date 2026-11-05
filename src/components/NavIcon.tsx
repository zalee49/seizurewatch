import type { ReactNode } from "react";

// A custom, two-tone set drawn on the same grid for the five primary sections.
const artwork = {
  today: (
    <>
      <ellipse cx="7.7" cy="13" rx="2.7" ry="3.6" transform="rotate(-25 7.7 13)" fill="currentColor" stroke="none" />
      <ellipse cx="13" cy="7.8" rx="2.6" ry="3.4" transform="rotate(-10 13 7.8)" fill="currentColor" stroke="none" />
      <ellipse cx="20" cy="8.2" rx="2.6" ry="3.4" transform="rotate(15 20 8.2)" fill="currentColor" stroke="none" />
      <ellipse cx="25" cy="14" rx="2.7" ry="3.6" transform="rotate(30 25 14)" fill="currentColor" stroke="none" />
      <path d="M9.2 22.1c1.6-2 2.7-6.1 6.8-6.1s5.2 4.1 6.8 6.1c2.7 3.5.2 6.5-3 5.4a11.2 11.2 0 0 0-7.6 0c-3.2 1.1-5.7-1.9-3-5.4Z" fill="currentColor" fillOpacity=".18" />
      <path d="M13.1 21.7c0-1.7 2-2.1 2.9-.7.9-1.4 2.9-1 2.9.7 0 1.3-1.7 2.5-2.9 3.3-1.2-.8-2.9-2-2.9-3.3Z" fill="currentColor" stroke="none" />
    </>
  ),
  calendar: (
    <>
      <rect x="5" y="6.5" width="22" height="22" rx="5" fill="currentColor" fillOpacity=".12" />
      <path d="M5 13V11.5a5 5 0 0 1 5-5h12a5 5 0 0 1 5 5V13Z" fill="currentColor" stroke="none" />
      <path d="M5 13h22M11 3.5v6m10-6v6" />
      <path d="M10 18h2m-2 5h2m5-5h2" strokeWidth="2.5" />
      <circle cx="22" cy="23" r="5" fill="var(--sw-surface)" stroke="none" />
      <circle cx="22" cy="23" r="4" fill="currentColor" stroke="none" />
      <path d="m20.2 23 1.2 1.2 2.4-2.5" stroke="var(--sw-surface)" strokeWidth="1.5" />
    </>
  ),
  meds: (
    <>
      <g transform="rotate(40 16 16)">
        <rect x="9" y="3" width="14" height="26" rx="7" fill="currentColor" fillOpacity=".13" />
        <path d="M9 16v6a7 7 0 0 0 14 0v-6Z" fill="currentColor" stroke="none" />
        <path d="M9 16h14M12.5 10a3.5 3.5 0 0 1 3.5-3.5" />
        <path d="M19.5 21a3.5 3.5 0 0 1-3.5 3.5" stroke="var(--sw-surface)" strokeWidth="1.5" />
      </g>
      <path d="M26 5v4m-2-2h4" strokeWidth="1.5" />
    </>
  ),
  bloodwork: (
    <>
      <g transform="rotate(20 16 16)">
        <path d="M10 7h12v16a6 6 0 0 1-12 0Z" fill="currentColor" fillOpacity=".12" />
        <path d="M10 18c4-2 8 2 12 0v5a6 6 0 0 1-12 0Z" fill="currentColor" stroke="none" />
        <rect x="8.5" y="3" width="15" height="5" rx="2" fill="currentColor" />
        <path d="M14 11v3m5 9v1" strokeWidth="1.5" />
        <path d="M13.5 21v2a2.5 2.5 0 0 0 2.5 2.5" stroke="var(--sw-surface)" strokeWidth="1.5" />
      </g>
      <path d="M26 13s3 3.3 3 5a3 3 0 0 1-6 0c0-1.7 3-5 3-5Z" fill="currentColor" fillOpacity=".2" strokeWidth="1.5" />
    </>
  ),
  history: (
    <>
      <path d="M10 5h14a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H10" fill="currentColor" fillOpacity=".08" />
      <rect x="6" y="3" width="19" height="24" rx="4" fill="var(--sw-surface)" />
      <rect x="6" y="3" width="19" height="24" rx="4" fill="currentColor" fillOpacity=".15" stroke="none" />
      <path d="M11 3v24M4 9h4m-4 6h4m-4 6h4" />
      <path d="M15 11h6m-6 5h6m-6 5h3" strokeWidth="2" />
      <path d="M11 3h-1a4 4 0 0 0-4 4v16a4 4 0 0 0 4 4h1Z" fill="currentColor" fillOpacity=".35" stroke="none" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NavIconName = keyof typeof artwork;

export default function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg className="size-8 shrink-0" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {artwork[name]}
    </svg>
  );
}
