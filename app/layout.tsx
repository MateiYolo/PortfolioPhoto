import type { Metadata } from "next";
import { Inter_Tight, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { Cursor } from "@/components/Cursor";
import { NavHeader } from "@/components/NavHeader";
import { SmoothScroll } from "@/components/SmoothScroll";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Matei Convard / Photography",
  description:
    "A photography portfolio: places and people photographed slowly, organised by category.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${interTight.variable}`}
      suppressHydrationWarning
    >
      <body>
        <SmoothScroll>
          <Cursor />
          <NavHeader />
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}
