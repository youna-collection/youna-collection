import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7h18M3 12h18M3 17h18" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

export function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

export function BagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 8h14l-1 13H6L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function HeartIcon({ filled = false, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <svg {...base} {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.6 4.5 6.8 4.5c2 0 3.5 1.1 5.2 3.1 1.7-2 3.2-3.1 5.2-3.1 3.2 0 5.1 3.1 4 6.2C19.5 15.4 12 20 12 20z" />
    </svg>
  );
}

export function TruckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 6.5h11v10h-11zM13.5 9.5h4l3.5 3.5v3.5h-7.5" />
      <circle cx="7" cy="17.5" r="2" fill="var(--color-paper, #fff)" />
      <circle cx="17" cy="17.5" r="2" fill="var(--color-paper, #fff)" />
    </svg>
  );
}

export function QuestionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.8M12 16.8v.2" />
    </svg>
  );
}

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.8" />
      <path d="M17 7v.01" strokeWidth="2" />
    </svg>
  );
}

export function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M13.5 3.5v11.25a3.25 3.25 0 1 1-3.25-3.25M13.5 3.5c.4 2.6 2.4 4.5 5 4.6" />
    </svg>
  );
}

export function SnapchatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5c-2.9 0-4.8 2.1-4.8 4.8v2.2l-1.6-.4c-.6-.1-1 .6-.5 1l1.8 1.1c-.6 1.6-1.8 2.8-3.6 3.5.4.7 1.3 1 2.4 1.1l.4 1.4c1 0 1.9-.3 2.8.1 1 .4 1.9 1.4 3.1 1.4s2.1-1 3.1-1.4c.9-.4 1.8-.1 2.8-.1l.4-1.4c1.1-.1 2-.4 2.4-1.1-1.8-.7-3-1.9-3.6-3.5l1.8-1.1c.5-.4.1-1.1-.5-1l-1.6.4V8.3c0-2.7-1.9-4.8-4.8-4.8z" />
    </svg>
  );
}
