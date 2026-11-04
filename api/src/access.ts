import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { log } from './log.js';

/**
 * Cloudflare Access single sign-on.
 *
 * When the app is published through Cloudflare Access, every request that passed the Access
 * login carries a JWT (header `Cf-Access-Jwt-Assertion`) signed by the Zero Trust team. We verify
 * the signature against the team's public keys and the application audience, so a forged header
 * (e.g. from the local network, which bypasses Cloudflare) is rejected.
 */
export const accessEnabled = Boolean(config.access.teamDomain && config.access.aud);

const issuer = `https://${config.access.teamDomain}`;
const jwks = accessEnabled ? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)) : null;

/** E-mail asserted by Cloudflare Access for this request, or null when there is no valid assertion. */
export async function accessEmail(req: Request): Promise<string | null> {
  if (!jwks) return null;
  const raw = req.headers['cf-access-jwt-assertion'];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: config.access.aud });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    return email || null;
  } catch (err) {
    (req.log ?? log).warn({ reason: (err as Error).message }, 'cloudflare access assertion rejected');
    return null;
  }
}

/** "maria.papadopoulou@x.gr" -> "Maria Papadopoulou" (placeholder name for auto-created accounts). */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const words = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return (words.join(' ') || email).slice(0, 100);
}
