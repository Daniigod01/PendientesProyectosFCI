import { ensureBoard, saveBoard } from "../lib/db.js";
import { seedBoard } from "../shared/seedData.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const board = await ensureBoard(seedBoard());
      res.status(200).json({ board });
    } catch (err) {
      // Sin Vercel KV configurado (o el proyecto aún no tiene la integración
      // conectada) — el frontend cae a localStorage automáticamente.
      res.status(503).json({ error: "backend no disponible", detalle: String(err) });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { board } = req.body || {};
      if (!board) {
        res.status(400).json({ error: "falta 'board' en el cuerpo" });
        return;
      }
      await saveBoard(board);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(503).json({ error: "backend no disponible", detalle: String(err) });
    }
    return;
  }

  res.status(405).json({ error: "método no permitido" });
}
