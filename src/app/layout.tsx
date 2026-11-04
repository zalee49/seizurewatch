import type { Metadata, Viewport } from "next";
import "./globals.css";
import RefreshOnFocus from "@/components/RefreshOnFocus";
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
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#121c19" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-dvh max-w-2xl px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1.5rem)]">
          <header className="mb-8 flex items-center gap-3 text-brand">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-2xl bg-brand/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
            </span>
            <span className="text-lg font-semibold tracking-tight">SeizureWatch</span>
          </header>
          {children}
        </div>
        <TabBar />
        <RefreshOnFocus />
      </body>
    </html>
  );
}
