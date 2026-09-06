import type { Metadata } from 'next';
import { Noto_Sans_KR, Noto_Serif_KR } from 'next/font/google';
import Script from 'next/script';

import { ClientPerformanceReporter } from '@/components/observability/client-performance-reporter';

import './globals.css';
import { themeInitScript } from '@/lib/theme';

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
});

const notoSerifKR = Noto_Serif_KR({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-noto-serif-kr',
});

export const metadata: Metadata = {
  description: 'AI 기반 소설 집필 도우미',
  title: 'Muse Novel',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${notoSansKR.variable} ${notoSerifKR.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ClientPerformanceReporter />
        {children}
      </body>
    </html>
  );
}
