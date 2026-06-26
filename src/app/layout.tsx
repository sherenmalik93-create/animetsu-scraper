import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Animetsu Scraper — m3u8 + Subtitle Extractor",
  description: "Self-hostable anime scraper for animetsu.live: extracts HLS m3u8 streams and VTT subtitles, enriched with AniList metadata.",
  keywords: ["animetsu", "scraper", "m3u8", "HLS", "anime", "AniList", "Next.js"],
  authors: [{ name: "Animetsu Scraper" }],
  openGraph: {
    title: "Animetsu Scraper",
    description: "Self-hostable anime scraper with m3u8 + subtitle extraction.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Animetsu Scraper",
    description: "Self-hostable anime scraper with m3u8 + subtitle extraction.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
