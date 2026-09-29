import type { Metadata } from "next";
import { IBM_Plex_Sans_KR, Nanum_Myeongjo } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const display = Nanum_Myeongjo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "일비서 — 헤드헌팅 할 일·일정 비서",
  description:
    "스팟·지속·언젠가 규칙으로 정렬하는 엑셀형 TO DO 개인 비서",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${sans.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
