import "./globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { cn } from "@/lib/core/utils";

import { Providers } from "./providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Embat Flow", template: "%s · Embat Flow" },
  description: "Circulante que se recalcula cada mes: score, límite y decisión de cada empresa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable, geistMono.variable)}
    >
      <body className="bg-background text-foreground antialiased">
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
