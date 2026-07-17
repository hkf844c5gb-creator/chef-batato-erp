import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // <--- É ESTA LINHA QUE DÁ VIDA AO DESIGN!

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chef Batatô ERP",
  description: "Sistema de Gestão do Chef Batatô",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
