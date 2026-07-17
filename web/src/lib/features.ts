/**
 * Feature flags for work that's built but not ready to be seen.
 *
 * Hiding, not deleting: the code and the data stay put, so turning a feature
 * back on is flipping one boolean rather than recovering it from git.
 */

/**
 * Proposals — hidden pending a rework.
 *
 * Set to `true` to bring back the nav item, the /proposals page, the "Upload
 * Proposal" action on an enquiry, and the go-to-proposals shortcut.
 *
 * The backend has its own switch (PROPOSALS_ENABLED in salesport/settings.py)
 * and is the one that actually protects the data — this flag only decides what
 * the console offers. Flip BOTH, or the page comes back and 404s.
 *
 * 36 proposals, including uploaded PDFs, remain in the database untouched.
 */
export const PROPOSALS_ENABLED = false;

/**
 * Liquid glass on the dashboard — TEMPORARY, for looking at only.
 *
 * Set to `false` to put the dashboard back exactly as it was: the flag gates
 * the backdrop, the SVG filter and every glass wrapper, so nothing but this
 * boolean has to change. Delete `components/ui/liquid-glass.tsx` and the
 * `glassDrift` keyframes in tokens.css to remove it entirely.
 *
 * Not shipped as-is: white-on-glass drops the KPI text well below the contrast
 * the rest of the app holds to. This is a preview, not a proposal.
 */
export const LIQUID_GLASS_PREVIEW = true;
