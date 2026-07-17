'use client';

import React from 'react';

/**
 * Liquid glass — TEMPORARY PREVIEW. Toggle with LIQUID_GLASS_PREVIEW in
 * lib/features.ts. Nothing else imports this; deleting the flag and this file
 * removes it completely.
 *
 * Adapted from the supplied component rather than pasted verbatim, because the
 * original targets Tailwind v4 and this project is on v3.4.6:
 *
 *   - `rounded-inherit` and `rounded-4xl` DO NOT EXIST in Tailwind 3. They
 *     compile to nothing — the corners would silently stay square. Replaced
 *     with real radii.
 *   - The demo's dock, its six remote PNG icons and the Unsplash backdrop are
 *     dropped: they're a showcase, not something a CRM dashboard wants. What's
 *     kept is the reusable part — the glass wrapper and its SVG filter.
 *
 * The effect only reads if something textured sits BEHIND it. Over the app's
 * flat --canvas, glass is nearly invisible: there is nothing to refract. Hence
 * GlassBackdrop below.
 */

interface GlassEffectProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const GlassEffect: React.FC<GlassEffectProps> = ({
  children,
  className = '',
  style = {},
}) => {
  const glassStyle: React.CSSProperties = {
    boxShadow: '0 6px 6px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 0, 0, 0.1)',
    transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 2.2)',
    ...style,
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl transition-all duration-700 ${className}`}
      style={glassStyle}
    >
      {/* Refraction layer — the SVG filter displaces whatever is behind it. */}
      <div
        className="absolute inset-0 z-0 overflow-hidden rounded-3xl"
        style={{
          backdropFilter: 'blur(3px)',
          filter: 'url(#glass-distortion)',
          isolation: 'isolate',
        }}
      />
      {/* Tint. The supplied component hardcodes white-25%, which assumes a
          light backdrop. Over this app's true-black dark canvas that becomes a
          mid-grey pane, and the black KPI text measured 2.03 against it —
          below the 3.0 minimum, i.e. unreadable. The dark variant tints the
          other way so the glass stays darker than its text. */}
      <div
        className="absolute inset-0 z-10 rounded-3xl bg-white/25 dark:bg-white/10"
      />
      {/* Specular edge — the highlight that sells it as a solid pane */}
      <div
        className="absolute inset-0 z-20 overflow-hidden rounded-3xl"
        style={{
          boxShadow:
            'inset 2px 2px 1px 0 rgba(255, 255, 255, 0.5), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.5)',
        }}
      />
      <div className="relative z-30 h-full">{children}</div>
    </div>
  );
};

/**
 * The filter itself. Must be mounted ONCE somewhere in the tree — every
 * GlassEffect references it by id (`url(#glass-distortion)`), and with no
 * matching filter in the DOM the browser drops the rule and you get a plain
 * blur with no distortion at all.
 */
export const GlassFilter: React.FC = () => (
  <svg aria-hidden style={{ display: 'none' }}>
    <filter
      id="glass-distortion"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      filterUnits="objectBoundingBox"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.001 0.005"
        numOctaves="1"
        seed="17"
        result="turbulence"
      />
      <feComponentTransfer in="turbulence" result="mapped">
        <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
        <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
        <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
      </feComponentTransfer>
      <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
      <feSpecularLighting
        in="softMap"
        surfaceScale="5"
        specularConstant="1"
        specularExponent="100"
        lightingColor="white"
        result="specLight"
      >
        <fePointLight x="-200" y="-200" z="300" />
      </feSpecularLighting>
      <feComposite
        in="specLight"
        operator="arithmetic"
        k1="0"
        k2="1"
        k3="1"
        k4="0"
        result="litImage"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="softMap"
        scale="200"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </svg>
);

/**
 * Something for the glass to refract.
 *
 * A colour-wash rather than the demo's Unsplash photo: a stock landscape
 * behind live pipeline figures makes the numbers unreadable, and readability is
 * the entire job of a KPI. The drifting blobs give the displacement map enough
 * texture to actually show, which a flat fill would not.
 *
 * `fixed` + `-z-10` so it sits behind the whole scroll container without
 * joining the layout.
 */
export const GlassBackdrop: React.FC = () => (
  <div
    aria-hidden
    className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    style={{ background: 'linear-gradient(120deg, #dbe4f5 0%, #eef1f6 45%, #e6dcf7 100%)' }}
    data-glass-backdrop
  >
    <div
      className="absolute -left-32 -top-40 h-[520px] w-[520px] rounded-full opacity-70 blur-3xl"
      style={{ background: 'radial-gradient(circle, #2547C8 0%, transparent 65%)', animation: 'glassDrift 26s ease-in-out infinite' }}
    />
    <div
      className="absolute -right-40 top-24 h-[560px] w-[560px] rounded-full opacity-60 blur-3xl"
      style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 65%)', animation: 'glassDrift 34s ease-in-out infinite reverse' }}
    />
    <div
      className="absolute bottom-[-160px] left-1/3 h-[480px] w-[480px] rounded-full opacity-60 blur-3xl"
      style={{ background: 'radial-gradient(circle, #0F8A7E 0%, transparent 65%)', animation: 'glassDrift 30s ease-in-out infinite' }}
    />
  </div>
);
