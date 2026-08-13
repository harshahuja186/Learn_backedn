import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { Todo, TodoInput, TodosResponse, User } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string; message?: string }>) => {
    const originalRequest = error.config as RetryConfig | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || "";
    const isRefreshCall = url.includes("/api/auth/refresh");
    const isLoginOrRegister =
      url.includes("/api/auth/login") || url.includes("/api/auth/register");

    if (
      error.response?.status === 401 &&
      !isRefreshCall &&
      !isLoginOrRegister &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        await apiClient.post("/api/auth/refresh", {});
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    return data?.error || data?.message || error.message || "Request failed";
  }
  if (error instanceof Error) return error.message;
  return "Request failed";
}

async function request<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    const { data } = await fn();
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export const api = {
  register: (payload: { name: string; email: string; password: string }) =>
    request<{ success: boolean; message: string; user: User }>(() =>
      apiClient.post("/api/auth/register", payload),
    ),

  login: (payload: { email: string; password: string }) =>
    request<{ success: boolean; message: string; user: User }>(() =>
      apiClient.post("/api/auth/login", payload),
    ),

  me: () =>
    request<{ success: boolean; data: { _id: string; name: string; email: string } }>(() =>
      apiClient.get("/api/auth/me"),
    ),

  getTodos: (page = 1, limit = 10) =>
    request<TodosResponse>(() =>
      apiClient.get("/api/todos", { params: { page, limit } }),
    ),

  getTodo: (id: string) =>
    request<{ success: boolean; data: Todo }>(() => apiClient.get(`/api/todos/${id}`)),

  createTodo: (payload: TodoInput) =>
    request<{ success: boolean; data: Todo }>(() =>
      apiClient.post("/api/todos", payload),
    ),

  updateTodo: (id: string, payload: TodoInput) =>
    request<{ success: boolean; data: Todo }>(() =>
      apiClient.put(`/api/todos/${id}`, payload),
    ),

  deleteTodo: (id: string) =>
    request<{ success: boolean; data: Todo }>(() =>
      apiClient.delete(`/api/todos/${id}`),
    ),
};

export { apiClient };
