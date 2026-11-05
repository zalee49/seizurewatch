import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import RefreshOnFocus from "@/components/RefreshOnFocus";
import Icon from "@/components/Icon";
import TabBar from "@/components/TabBar";

export const metadata: Metadata = {
  title: "SeizureWatch",
  description: "Track your dog's seizures, medication and bloodwork in one place.",
  appleWebApp: {
    capable: true,
    title: "SeizureWatch",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1226" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-dvh max-w-2xl px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1.5rem)]">
          <a href="#main-content" className="sw-skip-link">Skip to content</a>
          <header className="mb-8 flex items-center justify-between gap-3">
            <Link href="/" className="flex min-h-tap items-center gap-3 rounded-2xl" aria-label="SeizureWatch home">
              <span className="sw-logo flex size-11 items-center justify-center rounded-2xl text-white">
                <Icon name="activity" />
              </span>
              <span className="text-lg font-bold tracking-tight">Seizure<span className="text-brand">Watch</span></span>
            </Link>
            <span className="hidden rounded-full bg-brand/10 px-3 py-1.5 min-[360px]:inline-flex text-xs font-semibold text-brand">Care, together</span>
          </header>
          <div id="main-content" tabIndex={-1}>{children}</div>
        </div>
        <TabBar />
        <RefreshOnFocus />
      </body>
    </html>
  );
}
