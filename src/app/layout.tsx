import type { Metadata, Viewport } from "next";
import { APP_NAME, getSiteUrl } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: `${APP_NAME} – repère les signaux d'alerte d'une annonce`,
  description:
    "Envoie une capture ou un lien : on repère les signaux d'alerte d'arnaque sur Vinted, Leboncoin et d'autres sites de seconde main.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
        {children}
      </body>
    </html>
  );
}
