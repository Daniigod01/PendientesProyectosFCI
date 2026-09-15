// Capa de guardado de la app.
// - Si el backend (/api/board, con Vercel KV) está disponible, es la fuente
//   de verdad: ahí es donde Trello y Gmail escriben pendientes directamente.
// - Si no hay backend (por ejemplo corriendo local sin KV configurado, o el
//   fetch falla), cae a localStorage para que la app siga funcionando sola.
const PREFIX = "pendientes-tecnologia:";

export async function get(key) {
  try {
    const res = await fetch("/api/board");
    if (res.ok) {
      const data = await res.json();
      if (data && data.board) {
        return { key, value: JSON.stringify(data.board) };
      }
    }
  } catch {
    // sin backend disponible, seguimos con localStorage
  }
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return { key, value: raw };
  } catch {
    return null;
  }
}

export async function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // localStorage no disponible; seguimos igual, intentando el backend
  }
  try {
    const res = await fetch("/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: JSON.parse(value) }),
    });
    if (!res.ok) return null;
  } catch {
    // sin backend disponible: el guardado local ya quedó hecho arriba
  }
  return { key, value };
}
