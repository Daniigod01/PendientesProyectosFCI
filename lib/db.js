import { Redis } from "@upstash/redis";

export const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const BOARD_KEY = "pendientes-tecnologia:board";
export const GMAIL_LAST_SYNC_KEY = "pendientes-tecnologia:gmail-last-sync";

export async function getBoard() {
  return (await kv.get(BOARD_KEY)) || null;
}

export async function saveBoard(board) {
  await kv.set(BOARD_KEY, board);
}

// Devuelve el tablero guardado, o lo inicializa con `seed` si es la primera vez.
export async function ensureBoard(seed) {
  const existente = await getBoard();
  if (existente) return existente;
  await saveBoard(seed);
  return seed;
}

export function generarId(prefijo) {
  return `${prefijo}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
