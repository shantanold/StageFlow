/**
 * Direction B2 building blocks shared across screens: status pills, band
 * controls, the watermark, and the icon set. Styling lives in index.css.
 */
import type { ReactNode, SVGProps } from "react";
import { useNavigate } from "react-router-dom";

// ─── Icons (24px stroke set, matching the B2 mockups) ────────────────────────

type IconProps = SVGProps<SVGSVGElement>;

function Stroke({ children, strokeWidth = 2, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Home: (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><path d="M3 11.2L12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Stroke>,
  Box: (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><path d="M12 3l8.5 4.2v9.6L12 21l-8.5-4.2V7.2zM3.5 7.2L12 11.4l8.5-4.2M12 11.4V21" /></Stroke>,
  Scan: (p: IconProps) => <Stroke {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" /></Stroke>,
  Briefcase: (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5h6v2M3 13h18" /></Stroke>,
  More: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  ),
  Calendar: (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M16 3v4M8 3v4M3 10h18" /></Stroke>,
  Sets: (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><path d="M12 3l9 4.5-9 4.5-9-4.5z" /><path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5" /></Stroke>,
  Chart: (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><path d="M3 3v18h18" /><path d="M8 17v-5M13 17V8M18 17v-8" /></Stroke>,
  Building: (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4" /></Stroke>,
  Back: (p: IconProps) => <Stroke strokeWidth={2.4} {...p}><path d="M15 5l-7 7 7 7" /></Stroke>,
  Chevron: (p: IconProps) => <Stroke strokeWidth={2.4} {...p}><path d="M9 5l7 7-7 7" /></Stroke>,
  ChevronDown: (p: IconProps) => <Stroke strokeWidth={2.2} {...p}><path d="M6 9l6 6 6-6" /></Stroke>,
  Plus: (p: IconProps) => <Stroke strokeWidth={2.4} {...p}><path d="M12 5v14M5 12h14" /></Stroke>,
  Search: (p: IconProps) => <Stroke {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Stroke>,
  Return: (p: IconProps) => <Stroke {...p}><path d="M9 14l-5-5 5-5M4 9h11a5 5 0 0 1 0 10h-3" /></Stroke>,
  Edit: (p: IconProps) => <Stroke {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Stroke>,
  Close: (p: IconProps) => <Stroke strokeWidth={2.2} {...p}><path d="M18 6L6 18M6 6l12 12" /></Stroke>,
  Image: (p: IconProps) => <Stroke strokeWidth={1.5} {...p}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M4 16l5-5 4 4 2-2 5 5" /><circle cx="15.5" cy="8" r="1.5" /></Stroke>,
  Printer: (p: IconProps) => <Stroke {...p}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></Stroke>,
  Tag: (p: IconProps) => <Stroke {...p}><path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></Stroke>,
  Users: (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></Stroke>,
  Dollar: (p: IconProps) => <Stroke {...p}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Stroke>,
  LogOut: (p: IconProps) => <Stroke {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Stroke>,
};

// ─── Status glyphs (filled, 12px, for pills) ─────────────────────────────────

type Glyph = "check" | "clock" | "alert" | "trash" | "minus" | "play" | "pencil" | "x" | "question" | "tag";

function StatusGlyph({ kind }: { kind: Glyph }) {
  const common = { viewBox: "0 0 16 16", "aria-hidden": true, focusable: false } as const;
  switch (kind) {
    case "check":
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M5 8.2l2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M8 4.5V8l2.4 1.6" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "alert":
      return <svg {...common}><path d="M8 1.2L15.2 14H.8z" fill="currentColor" strokeLinejoin="round" /><path d="M8 6v3.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /><circle cx="8" cy="11.7" r="1" fill="#fff" /></svg>;
    case "trash":
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M5.5 6h5M6.3 6l.4 4.5h2.6l.4-4.5M7 6V5h2v1" fill="none" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "minus":
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M5 8h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "play":
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M6.5 5.2v5.6L11 8z" fill="#fff" /></svg>;
    case "pencil":
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M5.2 10.8l.4-1.6 3.8-3.8 1.2 1.2-3.8 3.8z" fill="#fff" /></svg>;
    case "x":
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "tag":
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><circle cx="8" cy="8" r="2.2" fill="#fff" /></svg>;
    default:
      return <svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M6.3 6.3a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.5-.7 1v.3" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="11.6" r=".9" fill="#fff" /></svg>;
  }
}

export type Tone = "green" | "teal" | "amber" | "red" | "gray" | "brand";

/**
 * A pale tint of the status hue behind dark text of the same hue, always with
 * an icon so state never rests on color alone.
 */
export function StatusPill({ tone, glyph, children, className = "", style }: {
  tone: Tone;
  glyph: Glyph;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`} style={style}>
      <StatusGlyph kind={glyph} />
      {children}
    </span>
  );
}

/** Item status (+ condition): Unstaged / Staged / Damaged / Missing / Disposed. */
export function ItemStatusPill({ status, condition, style }: { status: string; condition?: string; style?: React.CSSProperties }) {
  if (status === "missing") return <StatusPill tone="red" glyph="alert" style={style}>Missing</StatusPill>;
  if (status === "disposed") return <StatusPill tone="gray" glyph="trash" style={style}>Disposed</StatusPill>;
  if (condition === "damaged") return <StatusPill tone="red" glyph="alert" style={style}>Damaged</StatusPill>;
  if (status === "available") return <StatusPill tone="green" glyph="check" style={style}>Unstaged</StatusPill>;
  if (status === "staged") return <StatusPill tone="teal" glyph="clock" style={style}>Staged</StatusPill>;
  return <StatusPill tone="gray" glyph="question" style={style}>Unknown</StatusPill>;
}

/** Item condition: Good / Fair / Damaged. */
export function ConditionPill({ condition }: { condition: string }) {
  if (condition === "good") return <StatusPill tone="green" glyph="check">Good</StatusPill>;
  if (condition === "fair") return <StatusPill tone="amber" glyph="minus">Fair</StatusPill>;
  if (condition === "damaged") return <StatusPill tone="red" glyph="alert">Damaged</StatusPill>;
  return <StatusPill tone="gray" glyph="question">Unknown</StatusPill>;
}

/** Job status: Planning / Active / Completed / Cancelled. */
export function JobStatusPill({ status, style }: { status: string; style?: React.CSSProperties }) {
  if (status === "active") return <StatusPill tone="teal" glyph="play" style={style}>Active</StatusPill>;
  if (status === "planning") return <StatusPill tone="amber" glyph="pencil" style={style}>Planning</StatusPill>;
  if (status === "completed") return <StatusPill tone="green" glyph="check" style={style}>Completed</StatusPill>;
  if (status === "cancelled") return <StatusPill tone="gray" glyph="x" style={style}>Cancelled</StatusPill>;
  return <StatusPill tone="gray" glyph="question" style={style}>Unknown</StatusPill>;
}

/** Job-item pipeline: assigned → Unstaged; loaded/delivered/picked_up → Staged. */
export function JobItemStatusPill({ status }: { status: string }) {
  switch (status) {
    case "assigned": return <StatusPill tone="green" glyph="tag">Unstaged</StatusPill>;
    case "loaded":
    case "delivered":
    case "picked_up": return <StatusPill tone="teal" glyph="clock">Staged</StatusPill>;
    case "returned": return <StatusPill tone="green" glyph="check">Returned</StatusPill>;
    case "missing": return <StatusPill tone="red" glyph="alert">Missing</StatusPill>;
    default: return <StatusPill tone="gray" glyph="question">Unknown</StatusPill>;
  }
}

// ─── Band pieces ─────────────────────────────────────────────────────────────

/** Faint glyph in the band's corner, faded as one layer (wrapper opacity). */
export function BandWatermark({ kind = "box", children }: { kind?: "logo" | "box" | "briefcase" | "scan" | "sets" | "more" | "calendar" | "chart"; children?: ReactNode }) {
  if (kind === "logo") {
    return (
      <div className="band-watermark is-logo" aria-hidden="true">
        <img src="/logo-mark-white.png" alt="" />
      </div>
    );
  }
  const glyph = {
    box: <Icon.Box strokeWidth={1.1} />,
    briefcase: <Icon.Briefcase strokeWidth={1.1} />,
    scan: <Icon.Scan strokeWidth={1.1} />,
    sets: <Icon.Sets strokeWidth={1.1} />,
    more: <Icon.More />,
    calendar: <Icon.Calendar strokeWidth={1.1} />,
    chart: <Icon.Chart strokeWidth={1.1} />,
  }[kind];
  return <div className="band-watermark" aria-hidden="true">{children ?? glyph}</div>;
}

/** Back link on the band. `to` defaults to history back. */
export function BandBack({ to, label }: { to?: string | number; label: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => (typeof to === "string" ? navigate(to) : navigate((to as number | undefined) ?? -1))}
    >
      <Icon.Back />
      {label}
    </button>
  );
}

/** Square icon button on the band. */
export function BandIconButton({ label, onClick, filled = false, children }: {
  label: string;
  onClick: () => void;
  filled?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} className={`band-icon-btn${filled ? " is-filled" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** Initials for an avatar ("Sam Kim" → "SK"). */
export function initials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}
