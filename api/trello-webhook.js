import { ensureBoard, saveBoard } from "../lib/db.js";
import { seedBoard } from "../shared/seedData.js";

// IDs de las listas de Trello que te pertenecen a ti (Roger).
// "Por hacer" se deja fuera a propósito: solo cuando una tarjeta pasa a
// En proceso-Roger o Hecho-Roger es que se vuelve un pendiente en la app.
const LISTA_EN_PROCESO_ROGER = process.env.TRELLO_LIST_EN_PROCESO_ROGER_ID;
const LISTA_HECHO_ROGER = process.env.TRELLO_LIST_HECHO_ROGER_ID;

function listaAEstado(listId) {
  if (!listId) return null;
  if (listId === LISTA_EN_PROCESO_ROGER) return "en-curso";
  if (listId === LISTA_HECHO_ROGER) return "hecho";
  return null; // "Por hacer", tarjetas de Javier u otras listas: se ignoran
}

export default async function handler(req, res) {
  // Trello valida la URL del webhook con una llamada HEAD al crearlo.
  if (req.method === "HEAD" || req.method === "GET") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  try {
    const action = req.body?.action;
    const card = action?.data?.card;
    if (!card) {
      res.status(200).json({ ok: true, ignorado: "sin tarjeta en el payload" });
      return;
    }

    const listId = action.data.listAfter?.id || action.data.list?.id;
    const estado = listaAEstado(listId);
    if (!estado) {
      res.status(200).json({ ok: true, ignorado: "lista no es tuya" });
      return;
    }

    const board = await ensureBoard(seedBoard());
    const externalId = card.id;

    // Si la tarjeta ya se había importado antes, la quitamos de donde
    // estuviera para reponerla en su nuevo estado (evita duplicados).
    for (const key of Object.keys(board)) {
      board[key] = board[key].filter((t) => t.externalId !== externalId);
    }

    board[estado].push({
      id: `trello_${externalId}`,
      title: card.name || "(sin título)",
      description: card.desc ? card.desc.slice(0, 500) : "",
      project: "",
      priority: "media",
      dueDate: card.due ? card.due.slice(0, 10) : "",
      status: estado,
      source: "trello",
      externalId,
    });

    await saveBoard(board);
    res.status(200).json({ ok: true, estado });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
