import type { SVGProps } from 'react';

// A handful of 16px stroke icons, drawn for this project, so the UI needs no icon library.
type IconProps = SVGProps<SVGSVGElement>;

const base: IconProps = {
  viewBox: '0 0 16 16',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const MailIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="m2.5 4.5 5.5 4 5.5-4" />
  </svg>
);

export const ImageIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <circle cx="6" cy="6.5" r="1.2" />
    <path d="m2.5 12 3.5-3.5 2.5 2.5 2-2 3 3" />
  </svg>
);

export const TableIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M2 10h12M6.5 6.5v7" />
  </svg>
);

export const SendIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5z" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M8 1.75 13 3.5v4c0 3.2-2.1 5.6-5 6.75C5.1 13.1 3 10.7 3 7.5v-4z" />
    <path d="m5.75 8 1.6 1.6 2.9-3.1" />
  </svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M13 8H3M7 4 3 8l4 4" />
  </svg>
);
