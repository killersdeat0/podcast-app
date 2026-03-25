import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PlayerProvider } from "@/components/player/PlayerContext";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "SyncPods",
  description: "Podcast player with cross-device sync",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.variable} font-sans antialiased`}>
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
