import { io } from 'socket.io-client';
import { SOCKET_URL } from './api.js';

export function createSocket() {
  return io(SOCKET_URL, {
    auth: {
      token: localStorage.getItem('quiz_token')
    }
  });
}
