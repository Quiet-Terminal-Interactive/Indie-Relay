export function getToken() {
  return localStorage.getItem('ir_token');
}

export function getMember() {
  const raw = localStorage.getItem('ir_member');
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token, member) {
  localStorage.setItem('ir_token', token);
  localStorage.setItem('ir_member', JSON.stringify(member));
}

export function clearSession() {
  localStorage.removeItem('ir_token');
  localStorage.removeItem('ir_member');
}

export function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

export function requireCommittee() {
  const member = getMember();
  if (!getToken() || !member?.isCommittee) {
    window.location.href = '/dashboard.html';
    return false;
  }
  return true;
}

export function redirectIfAuthed() {
  if (getToken()) window.location.href = '/dashboard.html';
}
