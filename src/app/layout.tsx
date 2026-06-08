import type { Metadata } from "next";
import Script from "next/script";
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
  const midtransClientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '';
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const snapUrl = isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';

  return (
    <html lang="id">
      <body>
        {children}
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src={snapUrl}
          data-client-key={midtransClientKey}
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
