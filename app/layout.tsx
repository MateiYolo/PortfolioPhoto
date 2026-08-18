import type { Metadata } from "next";
import { Instrument_Serif, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import { Cursor } from "@/components/Cursor";
import { NavHeader } from "@/components/NavHeader";
import { PageTransition } from "@/components/PageTransition";
import { SmoothScroll } from "@/components/SmoothScroll";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Matei Convard — Photography",
  description:
    "A photography portfolio: places and people photographed slowly, organised by category.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${interTight.variable}`}
      suppressHydrationWarning
    >
      <body>
        <SmoothScroll>
          <Cursor />
          <NavHeader />
          <PageTransition>{children}</PageTransition>
        </SmoothScroll>
      </body>
    </html>
  );
}
