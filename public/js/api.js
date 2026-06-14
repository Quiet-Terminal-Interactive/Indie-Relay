const BASE = '';

async function request(method, path, body) {
  const token = localStorage.getItem('ir_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    localStorage.removeItem('ir_token');
    localStorage.removeItem('ir_member');
    if (token) window.location.href = '/login.html';
    throw new Error(data.error ?? 'Invalid credentials');
  }

  if (res.status === 403 && data.error?.startsWith('Your account is pending')) {
    window.location.href = '/dashboard.html';
    return;
  }

  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Something went wrong. Please try again.'), { status: res.status, data });
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
