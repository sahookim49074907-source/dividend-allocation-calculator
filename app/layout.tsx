import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "배당안분 계산기",
  description: "파산사건의 배당재원을 채권자별 확정 채권액 비율로 나누고 안분 내역서를 만드는 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
