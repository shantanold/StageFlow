import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ApiError } from "../lib/api";
import { AuthLayout } from "../components/AuthLayout";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [code, setCode] = useState("");
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
      await register(name, email, password, role, code);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create account" compact
      footer={<>Already have an account?{" "}<Link to="/login">Sign in</Link></>}
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <form onSubmit={handleSubmit}>
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
        <div>
          <label className="form-label" htmlFor="code">Signup code</label>
          <input
            id="code"
            type="text"
            className="input-field"
            placeholder="Ask your manager for this"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-full btn-lg"
          disabled={loading}
          style={{ marginTop: 4 }}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
