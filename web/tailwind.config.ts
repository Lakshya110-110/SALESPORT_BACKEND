import type { Config } from 'tailwindcss';

/**
 * SalesPort Tailwind theme — wired to the CSS variables in src/styles/tokens.css.
 * Component classes reference tokens (bg-primary, rounded-card, shadow-card) — never
 * raw hex, px, or radius values.
 *
 * SOURCE OF TRUTH for palette + shape: the uploaded Enterprise_CRM_Mockup_Airy.html.
 * Dark mode via `[data-theme="dark"]` on <html> (mockup default), also honoured on
 * `body.dark` so the current ThemeToggle keeps working.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  darkMode: ['selector', '[data-theme="dark"], body.dark'],
  theme: {
    extend: {
      colors: {
        // Brand
        ink: 'var(--ink)',
        navy: 'var(--navy)',

        // Primary
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          soft: 'var(--primary-soft)',
          fg: 'var(--on-primary)',
        },

        // Accents (blue accent + teal + purple)
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
        },
        teal: {
          DEFAULT: 'var(--teal)',
          soft: 'var(--teal-soft)',
        },
        purple: {
          DEFAULT: 'var(--purple)',
          soft: 'var(--purple-soft)',
        },

        // Chart series (funnel + bars + donut segments)
        bar1: 'var(--bar1)',
        bar2: 'var(--bar2)',
        bar3: 'var(--bar3)',

        // Surfaces
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        soft: 'var(--soft)',
        sunken: 'var(--sunken)',

        // Borders
        'b-subtle': 'var(--b-subtle)',
        'b-default': 'var(--b-default)',
        'b-strong': 'var(--b-strong)',

        // Content (text)
        content: {
          DEFAULT: 'var(--text)',
          muted: 'var(--muted)',
          subtle: 'var(--subtle)',
          disabled: 'var(--disabled)',
        },
        text: 'var(--text)',
        muted: 'var(--muted)',
        subtle: 'var(--subtle)',
        disabled: 'var(--disabled)',
        link: 'var(--link)',
        ring: 'var(--ring)',

        // Semantic status
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
        },
        info: {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)',
        },
      },
      borderRadius: {
        md: 'var(--r-md)',       // 10px
        lg: 'var(--r-lg)',       // 16px — cards, chart cards, form cards
        xl: 'var(--r-xl)',       // 22px — rail, dialogs, dropdowns
        card: 'var(--r-lg)',
        dialog: 'var(--r-xl)',
        full: 'var(--r-full)',
      },
      boxShadow: {
        // The uploaded HTML consolidates to two shadow tokens.
        card: 'var(--sh-card)',
        pop: 'var(--sh-pop)',
        // Semantic aliases kept so existing components (shadow-sm/md/lg/modal)
        // don't visually regress mid-migration — they map to `--sh-card` /
        // `--sh-pop` in the same tier.
        sm: 'var(--sh-card)',
        md: 'var(--sh-card)',
        lg: 'var(--sh-pop)',
        modal: 'var(--sh-pop)',
        hover: 'var(--sh-pop)',
        ring: '0 0 0 3px var(--primary-soft)',
      },
      fontFamily: {
        display: ['var(--display)', 'Sora', 'system-ui', 'sans-serif'],
        sans: ['var(--body)', 'Inter', 'system-ui', 'sans-serif'],
        body: ['var(--body)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      transitionDuration: {
        fast: '120ms',
        normal: '200ms',
        slow: '320ms',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0, 0, .2, 1)',
      },
      keyframes: {
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
        'row-glow': {
          '0%, 60%': { backgroundColor: 'var(--primary-soft)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        fade: 'fade 200ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'scale-in': 'scale-in 160ms ease-out',
        spin: 'spin .7s linear infinite',
        'row-glow': 'row-glow 600ms ease-out',
      },
      maxWidth: {
        app: '1280px',
        content: '1120px',
      },
    },
  },
  plugins: [],
};

export default config;
