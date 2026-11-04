import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, signToken } from '../auth.js';
import { HttpError, badRequest, notFound } from '../errors.js';
import { sendPasswordReset } from '../mail.js';
import { config } from '../config.js';
import { accessEmail, accessEnabled, nameFromEmail } from '../access.js';
import { loadSettings } from '../settings.js';

/** Accounts: the same e-mail / password login as Bill Split, plus Cloudflare Access single sign-on. */
export const authRouter = Router();

const email = z.string().trim().toLowerCase().email('Μη έγκυρο email');
const password = z.string().min(8, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες').max(200);

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name });

authRouter.post('/signup', async (req, res) => {
  const body = z
    .object({ email, name: z.string().trim().min(1, 'Το όνομα είναι υποχρεωτικό').max(100), password })
    .parse(req.body);

  const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
  if (exists.rowCount) throw new HttpError(409, 'Υπάρχει ήδη λογαριασμός με αυτό το email');

  const hash = await bcrypt.hash(body.password, 10);
  const { rows } = await pool.query<UserRow>(
    'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
    [body.email, body.name, hash],
  );
  const user = rows[0];
  await loadSettings(user.id); // the default place to watch
  req.log.info({ user: user.id, email: user.email }, 'account created');
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const body = z.object({ email, password: z.string().min(1) }).parse(req.body);
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
  const user = rows[0];
  const ok = user ? await bcrypt.compare(body.password, user.password_hash) : false;
  if (!user || !ok) {
    req.log.warn({ email: body.email, ip: req.ip, knownAccount: Boolean(user) }, 'login failed');
    throw new HttpError(401, 'Λάθος email ή κωδικός');
  }
  req.log.info({ user: user.id, email: user.email }, 'login ok');
  res.json({ token: signToken(user), user: publicUser(user) });
});

/**
 * Single sign-on through Cloudflare Access. The browser never sends credentials: Access already
 * authenticated the person and attached a signed assertion with their e-mail. First visit creates
 * the account (with a random, unusable password; "forgot password" sets one if ever needed).
 */
authRouter.post('/access', async (req, res) => {
  if (!accessEnabled) throw notFound('Το Cloudflare Access δεν είναι ρυθμισμένο');
  const email = await accessEmail(req);
  if (!email) throw new HttpError(401, 'Δεν υπάρχει έγκυρη σύνδεση Cloudflare Access');

  let user = (await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email])).rows[0];
  if (!user) {
    const hash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    user = (
      await pool.query<UserRow>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING *`,
        [email, nameFromEmail(email), hash],
      )
    ).rows[0];
    await loadSettings(user.id);
    req.log.info({ user: user.id, email }, 'account created via cloudflare access');
  }
  req.log.info({ user: user.id, email }, 'login ok via cloudflare access');
  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/forgot', async (req, res) => {
  const body = z.object({ email }).parse(req.body);
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
  const user = rows[0];
  if (user) {
    const token = randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
      [token, user.id],
    );
    const resetUrl = `${config.appUrl}/reset?token=${token}`;
    req.log.info({ user: user.id, email: user.email }, 'password reset requested');
    try {
      await sendPasswordReset(user.email, resetUrl);
    } catch (err) {
      req.log.error({ err, user: user.id }, 'failed to send password reset e-mail');
    }
  } else {
    req.log.warn({ email: body.email, ip: req.ip }, 'password reset requested for unknown e-mail');
  }
  // Always answer the same so the endpoint cannot be used to discover accounts.
  res.json({ ok: true });
});

authRouter.post('/reset', async (req, res) => {
  const body = z.object({ token: z.string().min(1), password }).parse(req.body);
  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM password_resets
      WHERE token = $1 AND used_at IS NULL AND expires_at > now()`,
    [body.token],
  );
  if (!rows[0]) throw badRequest('Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει');

  const hash = await bcrypt.hash(body.password, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].user_id]);
  await pool.query('UPDATE password_resets SET used_at = now() WHERE token = $1', [body.token]);
  req.log.info({ user: rows[0].user_id }, 'password reset completed');
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, 'Ο λογαριασμός δεν υπάρχει πλέον');
  res.json({ user: publicUser(rows[0]) });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      currentPassword: z.string().optional(),
      newPassword: password.optional(),
    })
    .parse(req.body);

  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user) throw new HttpError(401, 'Ο λογαριασμός δεν υπάρχει πλέον');

  if (body.name) {
    await pool.query('UPDATE users SET name = $1 WHERE id = $2', [body.name, user.id]);
  }
  if (body.newPassword) {
    const ok = body.currentPassword ? await bcrypt.compare(body.currentPassword, user.password_hash) : false;
    if (!ok) throw badRequest('Ο τρέχων κωδικός είναι λάθος');
    const hash = await bcrypt.hash(body.newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    req.log.info({ user: user.id }, 'password changed');
  }
  const updated = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [user.id]);
  res.json({ user: publicUser(updated.rows[0]) });
});
