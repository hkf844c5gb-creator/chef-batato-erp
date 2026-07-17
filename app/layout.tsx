import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chef Batatô ERP",
  description: "Sistema Integrado de Gestão",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
