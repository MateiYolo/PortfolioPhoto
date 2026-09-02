import type { Metadata } from "next";
import { Inter_Tight, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { Cursor } from "@/components/Cursor";
import { Intro } from "@/components/Intro";
import { NavHeader } from "@/components/NavHeader";
import { RouteScrollReset } from "@/components/RouteScrollReset";
import { ScrollVelocityProvider } from "@/components/ScrollVelocity";
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
          <ScrollVelocityProvider>
            <RouteScrollReset />
            <Cursor />
            <NavHeader />
            {/* Holds the page until it is smooth, then lifts off it: see
                components/Intro.tsx. Wraps the routes rather than sitting
                beside them because everything inside it reads whether the
                panel has gone before playing its own entrance. */}
            <Intro>{children}</Intro>
          </ScrollVelocityProvider>
        </SmoothScroll>
      </body>
    </html>
  );
}
