import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/src/query-client";

export const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
let token: string | null = null;
let onUnauthorized: () => void = () => {};

export function setToken(t: string | null) {
  token = t;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401 && path !== "/auth/login") onUnauthorized();
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data?.detail === "string" ? data.detail : `Erro ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b?: any) => request<T>("POST", p, b ?? {}),
  put: <T = any>(p: string, b: any) => request<T>("PUT", p, b),
  del: <T = any>(p: string) => request<T>("DELETE", p),
};

export const fileUrl = (path: string) => `${BASE}/files/${path}?token=${token}`;

export function useApi<T = any>(path: string | null) {
  return useQuery<T>({ queryKey: [path], queryFn: () => api.get<T>(path as string), enabled: !!path });
}
export function useList<T = any>(col: string) {
  return useApi<T[]>(`/c/${col}`);
}
export const invalidateAll = () => queryClient.invalidateQueries();
