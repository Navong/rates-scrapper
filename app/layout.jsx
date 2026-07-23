import "./globals.css";

export const metadata = {
  title: "Remittance rate comparison",
  description: "KR → multi-corridor remittance rate comparison across providers.",
};

// Light mode only — declare it at the document level too (emits
// <meta name="color-scheme" content="light">) so the browser never applies dark
// UA styling to form controls/scrollbars even when the OS is in dark mode.
export const viewport = { width: "device-width", initialScale: 1, colorScheme: "light" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Pretendard keeps the Korean typography crisp (matches the legacy pages). */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
