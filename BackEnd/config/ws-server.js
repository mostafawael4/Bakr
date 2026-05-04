import { WebSocketServer } from 'ws';

let wss;

export function initWebSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    console.log(`[WS] Client connected (${wss.clients.size} total)`);

    ws.on('close', () => {
      console.log(`[WS] Client disconnected (${wss.clients.size} total)`);
    });
  });

  console.log('[WS] WebSocket server initialized');
}

export function getWss() {
  return wss;
}
