import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { api, setToken, setUnauthorizedHandler } from "@/src/api";
import { queryClient } from "@/src/query-client";

const KEY = "vbm_token";
type User = { id: string; name: string; email: string };
type Ctx = { user: User | null; loading: boolean; login: (e: string, p: string) => Promise<void>; logout: () => Promise<void> };
const AuthCtx = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    await storage.secureRemove(KEY);
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    (async () => {
      const t = await storage.secureGet(KEY, null);
      if (t) {
        setToken(t as string);
        try {
          setUser(await api.get("/auth/me"));
        } catch {
          await logout();
        }
      }
      setLoading(false);
    })();
  }, [logout]);

  const login = async (email: string, password: string) => {
    const r = await api.post("/auth/login", { email, password });
    setToken(r.token);
    await storage.secureSet(KEY, r.token);
    setUser(r.user);
  };

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
