import { raw, type SafeHtml } from './dom';

/**
 * Material icons (Apache 2.0), the same ones the Android app uses, as inline SVG.
 * They take the text colour (`currentColor`) and are hidden from screen readers:
 * the button or link around them carries the label.
 */
const PATHS = {
  /** Android: res/drawable/ic_directions.xml */
  directions:
    'M21.71,11.29l-9,-9c-0.39,-0.39 -1.02,-0.39 -1.41,0l-9,9c-0.39,0.39 -0.39,1.02 0,1.41l9,9c0.39,0.39 1.02,0.39 1.41,0l9,-9c0.39,-0.38 0.39,-1.01 0,-1.41zM14,14.5V12h-4v3H8v-4c0,-0.55 0.45,-1 1,-1h5V7.5l3.5,3.5 -3.5,3.5z',
  /** Android: Icons.Filled.Share */
  share:
    'M18,16.08c-0.76,0 -1.44,0.3 -1.96,0.77L8.91,12.7c0.05,-0.23 0.09,-0.46 0.09,-0.7s-0.04,-0.47 -0.09,-0.7l7.05,-4.11c0.54,0.5 1.25,0.81 2.04,0.81 1.66,0 3,-1.34 3,-3s-1.34,-3 -3,-3 -3,1.34 -3,3c0,0.24 0.04,0.47 0.09,0.7L8.04,9.81C7.5,9.31 6.79,9 6,9c-1.66,0 -3,1.34 -3,3s1.34,3 3,3c0.79,0 1.5,-0.31 2.04,-0.81l7.12,4.16c-0.05,0.21 -0.08,0.43 -0.08,0.65 0,1.61 1.31,2.92 2.92,2.92s2.92,-1.31 2.92,-2.92 -1.31,-2.92 -2.92,-2.92z',
} as const;

export type IconName = keyof typeof PATHS;

/** An icon as inline SVG (constant markup, no user data). */
export const icon = (name: IconName): SafeHtml =>
  raw(
    `<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${PATHS[name]}"/></svg>`,
  );
