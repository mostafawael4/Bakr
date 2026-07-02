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

export function broadcast(data) {
  if (!wss) return;
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}
