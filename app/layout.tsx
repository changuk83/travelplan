import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./scroll-fix.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "길담 | 자동차와 도보를 잇는 여행",
  description: "경로 위 휴게소와 도보 일정을 함께 설계하는 국내 여행 플래너",
  openGraph: {
    title: "길담 | 자동차와 도보를 잇는 여행",
    description: "경로 위 휴게소와 도보 일정을 함께 설계하는 국내 여행 플래너",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "길담 여행 플래너" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "길담 | 자동차와 도보를 잇는 여행",
    description: "경로 위 휴게소와 도보 일정을 함께 설계하는 국내 여행 플래너",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "길담",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f1e8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <a className="google-test-shortcut" href="/overseas" aria-label="Google 해외 일정 열기">해외 일정 <span aria-hidden="true">G</span></a>
      </body>
    </html>
  );
}
