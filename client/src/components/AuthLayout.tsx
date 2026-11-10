import type { ReactNode } from "react";

/**
 * B2 auth screen: the brand purple exactly matches the logo's own background,
 * so the logo sits flush and borderless. The form lives on a light sheet that
 * rises from the bottom (a centered card on wide screens).
 */
export function AuthLayout({ title, compact = false, children, footer }: {
  title: string;
  compact?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={`auth-screen${compact ? " is-compact" : ""}`}>
      <div className="auth-hero">
        <img className="auth-logo" src="/logo-app.png" alt="" />
        <span className="auth-wordmark">Stagemigo</span>
        <span className="auth-tagline">Home staging inventory</span>
      </div>
      <main className="auth-sheet">
        <h1 className="auth-title">{title}</h1>
        {children}
        {footer && <p className="auth-footer">{footer}</p>}
      </main>
    </div>
  );
}
