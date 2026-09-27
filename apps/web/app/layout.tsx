import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-hud-mono" });

export const metadata: Metadata = {
  title: "Lifelog",
  description: "Your day, quietly noted",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#050b10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
