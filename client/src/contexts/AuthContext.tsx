import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { User, AuthResponse } from "../types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  /** Platform admin on their own (org-agnostic) screens, not inside an org. */
  isAdminMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: "staff" | "manager", code: string) => Promise<void>;
  logout: () => void;
  /** Platform admin: switch the whole app into one customer org, with manager rights. */
  enterOrg: (orgId: string) => Promise<void>;
  /** Back to the admin's own account. */
  exitOrg: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "sf_token";
/** The admin's own token, parked while `sf_token` holds an org-scoped acting token. */
const ADMIN_TOKEN_KEY = "sf_admin_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  /** Puts the admin's own token back in place (if one is parked). */
  const restoreAdminToken = useCallback(() => {
    const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!adminToken) return false;
    localStorage.setItem(TOKEN_KEY, adminToken);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    return true;
  }, []);

  // On mount, verify any stored token
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }
    api.get<User>("/auth/me")
      .then((u) => setUser(u))
      .catch(async (err) => {
        if (!(err instanceof ApiError && err.status === 401)) return;
        // An expired acting token: fall back to the admin's own session.
        if (restoreAdminToken()) {
          try {
            setUser(await api.get<User>("/auth/me"));
            return;
          } catch {
            // fall through and sign out
          }
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ADMIN_TOKEN_KEY);
      })
      .finally(() => setIsLoading(false));
  }, [restoreAdminToken]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<AuthResponse>("/auth/login", { email, password });
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string, role: "staff" | "manager", code: string) => {
      const data = await api.post<AuthResponse>("/auth/register", { name, email, password, role, code });
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const enterOrg = useCallback(async (orgId: string) => {
    const { token } = await api.post<{ token: string }>(`/admin/organizations/${orgId}/act`, {});
    // Keep the original admin token if we're hopping straight from one org to another.
    if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
      localStorage.setItem(ADMIN_TOKEN_KEY, localStorage.getItem(TOKEN_KEY) ?? "");
    }
    localStorage.setItem(TOKEN_KEY, token);
    // Cached queries belong to the previous org.
    queryClient.clear();
    setUser(await api.get<User>("/auth/me"));
  }, [queryClient]);

  const exitOrg = useCallback(async () => {
    restoreAdminToken();
    queryClient.clear();
    setUser(await api.get<User>("/auth/me"));
  }, [queryClient, restoreAdminToken]);

  const isAdminMode = !!user?.is_platform_admin && !user.acting_org;

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdminMode, login, register, logout, enterOrg, exitOrg }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
