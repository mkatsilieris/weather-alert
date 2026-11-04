import { api } from './api';

/**
 * Web Push on this device. The service worker (sw.ts) shows the notifications; here we only ask
 * for permission, subscribe through the browser's push service and hand the subscription to the API.
 *
 * iPhone/iPad: Safari only offers push to web apps added to the home screen (iOS 16.4+), so in a
 * plain browser tab `Notification` does not exist and the state is 'unsupported'.
 */
export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function enablePush(): Promise<void> {
  if (!supported()) throw new Error('Ο browser δεν υποστηρίζει ειδοποιήσεις push');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Δεν δόθηκε άδεια για ειδοποιήσεις');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>('/push/key');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
}

export async function disablePush(): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}

/** The VAPID public key is base64url; the browser wants raw bytes. */
function toKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
