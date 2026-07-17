import { io } from 'socket.io-client';
import { API_URL } from '../api/client';

let socket = null;

export function getSocket() {
  if (socket) return socket;
  const base = API_URL.replace(/\/api$/, '');
  socket = io(base, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    auth: (cb) => cb({ token: localStorage.getItem('admin_token') || '' }),
  });
  return socket;
}

// Admins auto-join role:admin server-side, so order_update fires for every order.
export function onOrderFeed(cb) {
  const s = getSocket();
  const h = (data) => cb(data);
  s.on('order_update', h);
  return () => s.off('order_update', h);
}
