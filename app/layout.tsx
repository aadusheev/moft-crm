import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOFT · Клиенты и результат",
  description: "Простая CRM для ежедневной работы с клиентами.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
