import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { pushPublicKey, sendPushToUser } from '../notify.js';

/** Web Push subscriptions of the signed-in person's devices. */
export const pushRouter = Router();
pushRouter.use(requireAuth);

pushRouter.get('/key', (_req, res) => {
  res.json({ key: pushPublicKey() });
});

const subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
});

pushRouter.post('/subscribe', async (req, res) => {
  const body = subscription.parse(req.body);
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, failures = 0`,
    [req.user.id, body.endpoint, body.keys.p256dh, body.keys.auth, (req.headers['user-agent'] ?? '').slice(0, 300)],
  );
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [req.user.id]);
  req.log.info({ user: req.user.id, devices: rows[0].n }, 'push subscription saved');
  res.status(201).json({ ok: true, devices: rows[0].n });
});

pushRouter.delete('/subscribe', async (req, res) => {
  const body = z.object({ endpoint: z.string().min(1) }).parse(req.body);
  await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.id, body.endpoint]);
  res.status(204).end();
});

pushRouter.get('/devices', async (req, res) => {
  const { rows } = await pool.query<{ id: number; endpoint: string; user_agent: string | null; created_at: string; last_used_at: string | null }>(
    'SELECT id, endpoint, user_agent, created_at, last_used_at FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at',
    [req.user.id],
  );
  res.json({ devices: rows });
});

/** Sends a test notification to every device of the person, so they can see it works. */
pushRouter.post('/test', async (req, res) => {
  const result = await sendPushToUser(req.user.id, {
    title: 'Δοκιμαστική ειδοποίηση',
    body: 'Έτσι θα μάθετε ότι έρχεται βροχή.',
    tag: 'test',
    url: '/',
  });
  res.json(result);
});
