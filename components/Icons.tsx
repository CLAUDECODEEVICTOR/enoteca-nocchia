import { ReactNode } from "react";

interface IconProps {
  className?: string;
  size?: number;
}

// One family: 24 grid, 1.5 stroke, round ends, drawn to sit in the same optical box.
function Icona({ className, size = 24, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// The round badge in front of every section title of the card.
export function BolloIcona({ children }: { children: ReactNode }) {
  return (
    <span
      className="w-10 h-10 shrink-0 rounded-full grid place-items-center"
      style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.22)", color: "var(--color-gold)" }}
    >
      {children}
    </span>
  );
}

export function IconEye(p: IconProps) {
  return (
    <Icona {...p}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx={12} cy={12} r={2.75} />
    </Icona>
  );
}

// Aroma rising from the glass: three soft waves, the middle one taller.
export function IconNose(p: IconProps) {
  return (
    <Icona {...p}>
      <path d="M6 20.5c-1.6-1.8 1.6-3.4 0-5.2s1.6-3.4 0-5.2" />
      <path d="M12 20.5c-1.7-2 1.7-3.8 0-5.8s1.7-3.8 0-5.8 1.7-3.6 0-5.4" />
      <path d="M18 20.5c-1.6-1.8 1.6-3.4 0-5.2s1.6-3.4 0-5.2" />
    </Icona>
  );
}

// A drop: what the wine leaves in the mouth.
export function IconPalate(p: IconProps) {
  return (
    <Icona {...p}>
      <path d="M12 3.5s-5.5 6.1-5.5 10a5.5 5.5 0 0 0 11 0c0-3.9-5.5-10-5.5-10Z" />
      <path d="M9.4 14.2a2.6 2.6 0 0 0 2.6 2.6" />
    </Icona>
  );
}

export function IconThermometer(p: IconProps) {
  return (
    <Icona {...p}>
      <path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z" />
      <path d="M12 9.5v5.8" />
      <circle cx={12} cy={16.9} r={1.6} fill="currentColor" stroke="none" />
      <path d="M16.5 6h1.5M16.5 9h1.5" />
    </Icona>
  );
}

export function IconUtensils(p: IconProps) {
  return (
    <Icona {...p}>
      <path d="M7 3v5.5a2 2 0 0 0 4 0V3" />
      <path d="M9 3v18" />
      <path d="M17.5 21V3c-1.9 1-3 3.6-3 7v3.5h3" />
    </Icona>
  );
}

export function IconWineGlass(p: IconProps) {
  return (
    <Icona {...p}>
      <path d="M7 3h10l-.5 5a4.5 4.5 0 0 1-9 0Z" />
      <path d="M7.3 6.5h9.4" />
      <path d="M12 12.5V20" />
      <path d="M8.5 20.5h7" />
    </Icona>
  );
}

export function IconCamera(p: IconProps) {
  return (
    <Icona {...p}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx={12} cy={13} r={3} />
    </Icona>
  );
}
