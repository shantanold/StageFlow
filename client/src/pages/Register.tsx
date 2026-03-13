import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ApiError } from "../lib/api";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password, role);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 18px",
        background: "var(--bg-deep)",
      }}
    >
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
            boxShadow: "0 0 28px rgba(59,130,246,0.35)",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
            <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
          </svg>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.4px" }}>
          StageFlow
        </h1>
      </div>

      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "24px 20px",
        }}
        className="animate-in"
      >
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 20 }}>Create account</h2>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--red-dim)",
              color: "var(--red-text)",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="form-label" htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              className="input-field"
              placeholder="Jane Smith"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input-field"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input-field"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="form-label" htmlFor="role">Role</label>
            <select
              id="role"
              className="input-field"
              value={role}
              onChange={(e) => setRole(e.target.value as "staff" | "manager")}
            >
              <option value="staff">Staff — can scan and view</option>
              <option value="manager">Manager — full access</option>
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
            style={{ marginTop: 4 }}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>

      <p style={{ marginTop: 20, fontSize: 13, color: "var(--text-tertiary)" }}>
        Already have an account?{" "}
        <Link to="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
