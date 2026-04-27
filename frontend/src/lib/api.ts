export const API_URL = '/api';

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  
  if (!res.ok) {
    if (res.status === 401) {
      const { useAuthStore } = await import('../store/authStore');
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Error ${res.status}`);
  }
  
  if (res.status !== 204) {
    return res.json().catch(() => ({}));
  }
  return null;
}
