import type { Metadata } from 'next';
import { Baloo_2, Nunito, Quicksand } from 'next/font/google';
import './globals.css';

const baloo = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-baloo',
});
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-nunito',
});
const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-quicksand',
});

export const metadata: Metadata = {
  title: 'EDUTIA',
  description: 'Aprender, de a poquito, con SOL',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${baloo.variable} ${nunito.variable} ${quicksand.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
