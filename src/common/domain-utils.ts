export const SKIP_DOMAINS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '10.0.2.2',
  '[::1]',
]);

export function isLocalDomain(hostname: string): boolean {
  if (SKIP_DOMAINS.has(hostname)) return true;
  // 192.168.x.x, 10.x.x.x, 172.16-31.x.x
  if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return true;
  // IPv6 loopback without brackets
  if (hostname === '::1') return true;
  // IPv6 link-local (fe80::) and unique local (fc/fd)
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (/^fe80:/i.test(bare)) return true;
  if (/^f[cd]/i.test(bare)) return true;
  return false;
}
