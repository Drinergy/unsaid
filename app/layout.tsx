import type { Metadata, Viewport } from 'next';
import { Inter, Newsreader } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/error-boundary';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
// Serif for the voice of the app (title, tagline, the thoughts themselves); sans stays for controls
const serif = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  title: 'Unsaid - Anonymous Thoughts on a World Map',
  description: 'Share your unsaid thoughts anonymously on a dark, night-flight style world map',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="antialiased">
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
