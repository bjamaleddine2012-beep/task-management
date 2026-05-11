import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaInstaller } from "@/components/pwa-installer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Task Management",
  description: "Manage and assign tasks to your team",
  manifest: "/manifest.json",
  applicationName: "Tasks",
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    title: "Tasks",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      // iOS Safari only honors PNG here; SVGs render as a generic screenshot.
      { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon", url: "/icon-maskable.svg", color: "#0f172a" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  // viewport-fit=cover lets the app draw under the iOS notch and home
  // indicator. We compensate with env(safe-area-inset-*) in globals.css.
  viewportFit: "cover",
  // 16px+ on inputs prevents iOS Safari from auto-zooming on focus, but
  // we still allow user pinch-zoom for accessibility.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaInstaller />
      </body>
    </html>
  );
}
