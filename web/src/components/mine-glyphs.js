/** 线宽 2。网页上摄影师申请的相机是 1.6px 描边，这条线宽栅格化后才和它一样粗。小程序位图按 1.5 画，缩到 44rpx 后和相机的 3rpx 描边一样粗。viewBox 22。 */
export const mineGlyphs = {
  headset: `
    <path d="M7.2 12.2V9.3a3.8 3.8 0 0 1 7.6 0v2.9"/>
    <rect x="3.2" y="10.4" width="4" height="6.2" rx="1.15"/>
    <rect x="14.8" y="10.4" width="4" height="6.2" rx="1.15"/>
  `,
  hex: `
    <polygon points="11,1.7 19.7,6.7 19.7,15.3 11,20.3 2.3,15.3 2.3,6.7"/>
    <path d="M6.3 9.3h9.4M6.3 12.7h9.4"/>
  `,
  bubble: `
    <path d="M6.2 4.6h9.2a2.6 2.6 0 0 1 2.6 2.6v4.6a2.6 2.6 0 0 1-2.6 2.6H9.2L5.2 18.2 6.4 14.4H6.2a2.6 2.6 0 0 1-2.6-2.6V7.2a2.6 2.6 0 0 1 2.6-2.6z"/>
  `,
  card: `
    <rect x="1.3" y="4.4" width="19.4" height="13" rx="2"/>
    <path d="M2.6 8.6h16.8"/>
    <rect x="3.5" y="11.1" width="5" height="2.7" rx="0.6"/>
  `,
  people: `
    <circle cx="15.7" cy="5.8" r="2"/>
    <path d="M12.9 11.5a2.9 2.9 0 0 1 5.6 0"/>
    <circle cx="8" cy="8.3" r="2.75"/>
    <path d="M2.7 16.9a5.35 5.35 0 0 1 10.7 0"/>
  `,
  cube: `
    <polygon points="11,1.6 20.1,6.9 20.1,15.1 11,20.4 1.9,15.1 1.9,6.9"/>
    <path d="M11 1.6V20.4M1.9 6.9 11 11.7 20.1 6.9"/>
  `,
  smile: `
    <path d="M6.4 1.6h8.8a3.4 3.4 0 0 1 3.4 3.4v6.8a3.4 3.4 0 0 1-3.4 3.4H9.6L5.2 20.2 7.2 15.2H6.4a3.4 3.4 0 0 1-3.4-3.4V5a3.4 3.4 0 0 1 3.4-3.4z"/>
    <circle cx="8.6" cy="7.6" r="0.7" fill="currentColor" stroke="none"/>
    <circle cx="13" cy="7.6" r="0.7" fill="currentColor" stroke="none"/>
    <path d="M8.2 10.2q2.6 2.4 5.2 0"/>
  `,
  yen: `
    <circle cx="11" cy="11" r="8.2"/>
    <path d="M7.3 6.7 11 10.8 14.7 6.7M11 10.8v5.5M7.5 11.7h7M7.5 14h7"/>
  `,
  cap: `
    <polygon points="11,2.6 20,8.2 11,12.8 2,8.2"/>
    <path d="M8.1 14.2h5.8v3.1a1.2 1.2 0 0 1-1.2 1.2h-3.4a1.2 1.2 0 0 1-1.2-1.2z"/>
    <path d="M17.2 8.4v4.6"/>
    <circle cx="17.2" cy="14.1" r="0.85" fill="currentColor" stroke="none"/>
  `,
  peak: `
    <circle cx="11" cy="11" r="8.2"/>
    <polygon points="11,5.5 6.3,15.4 15.7,15.4"/>
  `,
};
