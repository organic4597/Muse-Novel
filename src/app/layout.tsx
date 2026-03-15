import type { Metadata } from 'next';

import Script from 'next/script';

import { Noto_Sans_KR } from 'next/font/google';

import './globals.css';
import { themeInitScript } from '@/lib/theme';

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
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
      <body className={`${notoSansKR.variable} font-sans antialiased`} suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
