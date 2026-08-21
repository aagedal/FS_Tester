import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "FS Bench Lab",
  description: "A fair, reproducible workspace for developer filesystem benchmarks.",
  openGraph: {
    title: "FS Bench Lab",
    description: "Fair, reproducible filesystem benchmarks.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "FS Bench Lab benchmark dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FS Bench Lab",
    description: "Fair, reproducible filesystem benchmarks.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
