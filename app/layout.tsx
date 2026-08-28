import type { Metadata } from "next";

// Self-hosted fonts (bundled from npm) instead of next/font/google, since
// this sandbox can't reach fonts.googleapis.com at build time. Same
// typefaces the design system calls for -- Fraunces + IBM Plex Sans.
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/400-italic.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/fraunces/900.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";

import "./globals.css";

export const metadata: Metadata = {
  title: "Study Squad",
  description:
    "Find your study squad — peer-matched study groups for HSC and admission-test aspirants.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-parchment text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
