/**
 * Google Fonts loaded via next/font for zero-CLS, auto-preloaded webfonts.
 * Exposes each family as a CSS variable so tailwind.config.ts references them
 * via `var(--font-*)` and consumers can also apply them via className.
 *
 * Weights match the design system §03 Typography exactly:
 *   Sora            500 / 600 / 700 / 800
 *   Inter           400 / 500 / 600 / 700
 *   JetBrains Mono  400 / 500
 *
 * Import in app/layout.tsx and spread the classNames onto <html>:
 *   import { sora, inter, jetbrainsMono } from './fonts';
 *   <html className={`${sora.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
 */
import { Sora, Inter, JetBrains_Mono } from 'next/font/google';

export const sora = Sora({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
