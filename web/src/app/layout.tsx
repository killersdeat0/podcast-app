import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PlayerProvider } from "@/components/player/PlayerContext";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "SyncPods — Podcast Player with Cross-Device Sync",
  description: "Listen to any podcast and pick up exactly where you left off — on any device. SyncPods syncs your queue, progress, and subscriptions automatically.",
  ...(process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID && {
    other: { 'google-adsense-account': process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID },
  }),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className={`${geist.variable} font-sans antialiased`}>
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
