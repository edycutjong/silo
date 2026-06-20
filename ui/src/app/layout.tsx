import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://dorahacks-t3live-silo.vercel.app'),
  title: 'Silo — TEE-secured Whistleblower Drop',
  description: 'Zero-knowledge whistleblower drop shielding source identity inside secure enclaves.',
  keywords: ['tee', 'whistleblower', 'anonymous', 'intel-tdx', 'privacy', 'verifiable-credentials', 'stash', 'otp'],
  authors: [{ name: 'Silo Core Team' }],
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Silo',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  openGraph: {
    title: 'Silo — TEE-secured Whistleblower Drop',
    description: 'Zero-knowledge whistleblower drop shielding source identity inside secure enclaves.',
    url: 'https://dorahacks-t3live-silo.vercel.app',
    siteName: 'Silo',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Silo Secure Drop',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Silo — TEE-secured Whistleblower Drop',
    description: 'Zero-knowledge whistleblower drop shielding source identity inside secure enclaves.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Orbitron:wght@600;800;900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body className="antialiased min-h-screen bg-[#030712] text-slate-100 overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
