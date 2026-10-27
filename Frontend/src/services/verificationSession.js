const KEY = 'sitepass:verification-session';

export function saveVerificationSession(session) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function getVerificationSession(siteId) {
  try {
    const session = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!session || session.siteId !== siteId || new Date(session.expiresAt).getTime() <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearVerificationSession() {
  sessionStorage.removeItem(KEY);
}
