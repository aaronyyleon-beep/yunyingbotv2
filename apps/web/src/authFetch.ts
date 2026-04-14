export function authFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem("auth_token");
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers }).then((response) => {
    if (response.status === 401) {
      localStorage.removeItem("auth_token");
      window.location.reload();
    }
    return response;
  });
}
