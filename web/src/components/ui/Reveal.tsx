'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Reveal — fades content in as it scrolls into view, entering FROM the
 * direction you're scrolling: scroll down and it rises from below, scroll up
 * and it drops from above. That's what makes the motion feel like it belongs
 * to the scroll rather than playing at you.
 *
 * Each element reveals ONCE and then stays put. Re-animating on every pass is
 * the thing that turns a nice effect into a tax on a tool people use all day —
 * you'd re-pay the animation every time you scrolled back to check a number.
 *
 * Not for dense table rows. It's for presentation surfaces (dashboard cards,
 * panels, section blocks) where the eye arrives at one thing at a time.
 *
 * Motion is skipped entirely when the OS asks for reduced motion — checked
 * here, not just dialled down in CSS, so no transform ever runs.
 */

// One scroll listener for every Reveal on the page, in capture phase so it
// catches the app's inner scroll container (<main>) as well as the window —
// scroll events don't bubble, so a normal document listener would miss it.
let scrollDir: 'down' | 'up' = 'down';
let lastPos = 0;
let listening = false;

function trackScroll() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  const onScroll = (e: Event) => {
    const t = e.target as HTMLElement | Document;
    const pos = t === document || t === document.documentElement
      ? window.scrollY
      : (t as HTMLElement).scrollTop;
    if (pos !== lastPos) {
      scrollDir = pos > lastPos ? 'down' : 'up';
      lastPos = pos;
    }
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** ms — stagger siblings by passing an increasing value. */
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  const [from, setFrom] = useState<'down' | 'up'>('down');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) { setShown(true); return; }

    // FAIL VISIBLE. The resting state of .sp-reveal is opacity:0, so anything
    // that stops this observer from ever firing would leave the card blank
    // permanently — an invisible dashboard is a far worse outcome than a
    // missing animation. If the API isn't there, skip straight to shown.
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return; }

    trackScroll();

    // Already on screen at mount (above the fold): show it without waiting for
    // a scroll that may never come.
    //
    // This path also carries a hidden document. A hidden tab has no rendering
    // lifecycle, so IntersectionObserver does not fire at all until it is
    // looked at (verified: with visibilityState 'hidden', an observer on
    // <body> never fired and rAF never ran). IO does deliver its first
    // callback once the tab becomes visible, so the below-fold case
    // self-heals — but this rect check keeps above-fold content from
    // depending on that at all.
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setFrom(scrollDir);
        setShown(true);
        io.disconnect();   // once only — see the note above
      },
      // A small negative bottom margin holds the reveal until the element is
      // properly in view rather than clipping the very edge of the viewport.
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-revealed={shown ? '' : undefined}
      className={cn('sp-reveal', from === 'up' && 'sp-reveal-from-top', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
