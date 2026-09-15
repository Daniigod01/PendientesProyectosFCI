import { google } from "googleapis";
import { ensureBoard, saveBoard } from "../lib/db.js";
import { seedBoard } from "../shared/seedData.js";
import { proyectoMencionado } from "../shared/proyectos.js";

function getOAuthClient() {
  const client = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return client;
}

export default async function handler(req, res) {
  // Se permite llamar de tres formas:
  // 1) Vercel Cron (manda el header x-vercel-cron)
  // 2) Manualmente desde el botón "sincronizar_correo" de la app (?manual=1)
  // 3) Un cron externo gratuito (cron-job.org) con ?secret=SYNC_SECRET
  const esCron = req.headers["x-vercel-cron"] === "1";
  const esManual = req.query.manual === "1";
  const secretoValido = process.env.SYNC_SECRET && req.query.secret === process.env.SYNC_SECRET;
  if (!esCron && !esManual && !secretoValido) {
    res.status(401).json({ error: "no autorizado" });
    return;
  }

  if (!process.env.GMAIL_REFRESH_TOKEN) {
    res.status(200).json({ ok: false, error: "GMAIL_REFRESH_TOKEN no configurado todavía", nuevos: 0 });
    return;
  }

  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: "v1", auth });

    // Ojo: NO se filtra por fecha aquí. El operador "after:" de Gmail filtra
    // por la fecha en que se RECIBIÓ el correo, no por cuándo lo moviste a la
    // etiqueta — así que un correo viejo que acabas de mover quedaría afuera.
    // En vez de eso, se revisan los últimos correos de la etiqueta y se
    // descartan los que ya estén importados (por su ID).
    const lista = await gmail.users.messages.list({
      userId: "me",
      q: "label:PENDIENTES-PROYECTOS",
      maxResults: 50,
    });

    const board = await ensureBoard(seedBoard());
    const idsExistentes = new Set(Object.values(board).flat().map((t) => t.externalId).filter(Boolean));

    let nuevos = 0;
    for (const m of lista.data.messages || []) {
      if (idsExistentes.has(m.id)) continue;

      const msg = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From"],
      });
      const headers = msg.data.payload?.headers || [];
      const asunto = headers.find((h) => h.name === "Subject")?.value || "(sin asunto)";
      const de = headers.find((h) => h.name === "From")?.value || "";
      const snippet = msg.data.snippet || "";

      // Si el correo no menciona ninguno de tus proyectos por nombre, igual
      // se crea el pendiente (ya lo moviste a la carpeta a propósito) — solo
      // que sin proyecto asignado, para que lo completes tú.
      const proyecto = proyectoMencionado(`${asunto} ${snippet}`) || "";

      board["por-hacer"].push({
        id: `gmail_${m.id}`,
        title: asunto,
        description: `${snippet}${de ? ` — de: ${de}` : ""}`.slice(0, 500),
        project: proyecto,
        priority: "media",
        dueDate: "",
        status: "por-hacer",
        source: "gmail",
        externalId: m.id,
      });
      nuevos++;
    }

    if (nuevos > 0) await saveBoard(board);

    res.status(200).json({ ok: true, nuevos });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
