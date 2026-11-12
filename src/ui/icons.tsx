import type { ComponentChildren, SVGAttributes } from 'preact';

/**
 * LarpCam's own icon set. 24 px grid, 1.75 px round strokes, drawn for this
 * app. Icons are decorative: the button around them carries the label.
 */

type IconProps = { size?: number } & SVGAttributes<SVGSVGElement>;

function Svg({ size = 24, children, ...rest }: IconProps & { children: ComponentChildren }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Two sliders: "More". */
export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h9M19 8h1M4 16h1M11 16h9" />
    <circle cx="16" cy="8" r="2.5" />
    <circle cx="8" cy="16" r="2.5" />
  </Svg>
);

/** Two arrows chasing each other: switch camera. */
export const IconFlip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 10a7.5 7.5 0 0 1 13.3-3.2L19.5 9" />
    <path d="M19.5 4.5V9H15" />
    <path d="M19.5 14a7.5 7.5 0 0 1-13.3 3.2L4.5 15" />
    <path d="M4.5 19.5V15H9" />
  </Svg>
);

export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
  </Svg>
);

/** A torch. */
export const IconLight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3.5h8v3l-2 3.5v9.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V10L8 6.5z" />
    <path d="M8 6.5h8M12 13v2" />
  </Svg>
);

export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V3.5M8 7l4-3.5L16 7" />
    <path d="M7.5 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.500h12a1.5 1.5 0 0 0 1.5-1.500v-7a1.5 1.5 0 0 0-1.5-1.500h-1.5" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.500h15M9.5 6.500V4.500h5v2M6.5 6.500l.8 12.100a1.5 1.5 0 0 0 1.5 1.400h6.400a1.5 1.5 0 0 0 1.5-1.400l.8-12.1" />
    <path d="M10 10.500v5.500M14 10.500v5.5" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8.500a2 2 0 0 1 2-2h1.700l1.3-2h7l1.3 2h1.700a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12.8" r="3.6" />
  </Svg>
);

/** Square with a plus: "Add to Home Screen". */
export const IconAddHome = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8.500v7M8.5 12h7" />
  </Svg>
);

/** A closed padlock: the privacy line. */
export const IconPrivate = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.500V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
);

/** A small rectangle in the current picture shape. */
export function IconShape({ ratio, size = 18 }: { ratio: number; size?: number }) {
  const max = 16;
  const w = ratio >= 1 ? max : max * ratio;
  const h = ratio >= 1 ? max / ratio : max;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <rect
        x={(20 - w) / 2}
        y={(20 - h) / 2}
        width={w}
        height={h}
        rx="2.5"
        stroke="currentColor"
        stroke-width="1.6"
      />
    </svg>
  );
}
