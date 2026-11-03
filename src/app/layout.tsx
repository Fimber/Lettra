import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Lettra — Your images, in words.",
  description:
    "Turn screenshots, documents and receipts into editable text. Private OCR that runs entirely in your browser.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
        />
        <meta name="theme-color" content="#f8f9f5" />
      </head>
      <body>{children}</body>
    </html>
  );
}
