import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jurnalis.AI - Solusi Jurnal Otomatis Dosen",
  description: "Bantu Dosen menyusun naskah publikasi ilmiah dari Laporan Penelitian dan Laporan PKM secara cepat, terformat, serta aman Turnitin AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
