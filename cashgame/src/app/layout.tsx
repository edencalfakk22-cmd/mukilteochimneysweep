import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ניהול קופה — משחקי קלפים",
    template: "%s | ניהול קופה",
  },
  description: "מערכת ניהול קופה, שחקנים וחובות למשחקי קלפים פרטיים",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ניהול קופה",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1e293b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" dir="rtl" richColors closeButton />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
