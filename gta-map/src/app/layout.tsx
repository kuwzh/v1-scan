import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { SITE } from "@/lib/config";
import "./globals.css";

const display = Montserrat({
  subsets: ["latin"],
  weight: ["800", "900"],
  style: ["italic"],
  variable: "--font-display",
});
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} : carte interactive GTA 6`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  openGraph: { siteName: SITE.name, locale: "fr_FR", type: "website" },
};

export const viewport: Viewport = { themeColor: "#0B0B12", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
