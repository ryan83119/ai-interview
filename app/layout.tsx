import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 面試模擬器 | 智能面試與評分建議系統",
  description: "結合職缺分析與履歷深挖的 AI 模擬面試系統，提供三道針對性問題與完整評分報告。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F8F6F2] text-[#2C302E] font-sans">
        {children}
      </body>
    </html>
  );
}
