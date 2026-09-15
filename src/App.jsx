import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, ChevronLeft, ChevronRight, ArrowRight, Pencil, Trash2, Circle, Volume2, VolumeX, Download, RefreshCw } from "lucide-react";
import * as Tone from "tone";
import { get as storageGet, set as storageSet } from "./storage";
import { seedBoard } from "../shared/seedData.js";
import { PROYECTOS } from "../shared/proyectos.js";

const ESTADOS = [
  { key: "por-hacer", label: "Por hacer", color: "#5EA8FF" },
  { key: "en-curso", label: "En curso", color: "#00E0D6" },
  { key: "bloqueado", label: "Bloqueado", color: "#FF3D81" },
  { key: "hecho", label: "Hecho", color: "#39FF88" },
];

const COLUMNAS_TABLERO = ESTADOS.slice(1); // en-curso, bloqueado, hecho

const PRIORIDADES = {
  alta: { label: "Alta", color: "#FF3D81" },
  media: { label: "Media", color: "#FFB020" },
  baja: { label: "Baja", color: "#39FF88" },
};

const STORAGE_KEY = "tablero-pendientes-v1";

function vacio() {
  return ESTADOS.reduce((acc, e) => ({ ...acc, [e.key]: [] }), {});
}
function nuevoId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function idxEstado(key) {
  return ESTADOS.findIndex((e) => e.key === key);
}

const RANGO_PRIORIDAD = { alta: 0, media: 1, baja: 2 };

// Prioridad Alta > Media > Baja; dentro de cada prioridad, fecha límite
// más próxima primero. Las tareas sin fecha quedan al final de su grupo.
function ordenarTareas(tareas) {
  return [...tareas].sort((a, b) => {
    const porPrioridad = RANGO_PRIORIDAD[a.priority] - RANGO_PRIORIDAD[b.priority];
    if (porPrioridad !== 0) return porPrioridad;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

// ---------- Sonido ----------
function useSonido() {
  const [muted, setMuted] = useState(false);
  const synthRef = useRef(null);
  const noiseRef = useRef(null);
  const startedRef = useRef(false);

  const ensure = useCallback(async () => {
    if (!startedRef.current) {
      try {
        await Tone.start();
        synthRef.current = new Tone.Synth({
          oscillator: { type: "triangle" },
          envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
        }).toDestination();
        synthRef.current.volume.value = -12;
        noiseRef.current = new Tone.NoiseSynth({
          noise: { type: "white" },
          envelope: { attack: 0.001, decay: 0.06, sustain: 0 },
        }).toDestination();
        noiseRef.current.volume.value = -22;
        startedRef.current = true;
      } catch {
        // audio unavailable; fail silently
      }
    }
  }, []);

  const play = useCallback(
    (kind) => {
      if (muted) return;
      ensure().then(() => {
        const s = synthRef.current;
        const n = noiseRef.current;
        if (!s) return;
        const now = Tone.now();
        try {
          if (kind === "click") {
            s.triggerAttackRelease("C6", 0.04, now);
          } else if (kind === "move") {
            s.triggerAttackRelease("A5", 0.04, now);
          } else if (kind === "start") {
            s.triggerAttackRelease("C5", 0.045, now);
            s.triggerAttackRelease("G5", 0.06, now + 0.05);
          } else if (kind === "add") {
            s.triggerAttackRelease("E5", 0.05, now);
            s.triggerAttackRelease("B5", 0.06, now + 0.06);
          } else if (kind === "save") {
            s.triggerAttackRelease("G5", 0.05, now);
            s.triggerAttackRelease("D6", 0.09, now + 0.07);
          } else if (kind === "delete") {
            s.triggerAttackRelease("F4", 0.09, now);
            if (n) n.triggerAttackRelease(0.06, now + 0.02);
          } else if (kind === "open") {
            s.triggerAttackRelease("F5", 0.035, now);
          } else if (kind === "tab") {
            s.triggerAttackRelease("D5", 0.04, now);
          }
        } catch {
          // ignore playback errors
        }
      });
    },
    [muted, ensure]
  );

  return { play, muted, toggleMuted: () => setMuted((m) => !m) };
}

export default function TableroPendientes() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("principal"); // 'principal' | 'tablero'
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState(null);
  const { play, muted, toggleMuted } = useSonido();

  useEffect(() => {
    (async () => {
      try {
        const res = await storageGet(STORAGE_KEY);
        setBoard(res ? JSON.parse(res.value) : seedBoard());
      } catch {
        setBoard(vacio());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Revisa cada 20s si llegaron pendientes nuevos desde Trello o Gmail
  // (solo tiene efecto si el backend /api/board está conectado a Vercel KV).
  useEffect(() => {
    const intervalo = setInterval(async () => {
      if (formOpen) return; // no interrumpir mientras se edita una tarea
      try {
        const res = await storageGet(STORAGE_KEY);
        if (res) setBoard(JSON.parse(res.value));
      } catch {
        // sin conexión con el backend por ahora, seguimos con lo que hay
      }
    }, 20000);
    return () => clearInterval(intervalo);
  }, [formOpen]);

  const persist = useCallback(async (next) => {
    setBoard(next);
    setSaving(true);
    try {
      const result = await storageSet(STORAGE_KEY, JSON.stringify(next));
      setError(result ? null : "No se pudo guardar. Los cambios podrían perderse.");
    } catch {
      setError("No se pudo guardar. Los cambios podrían perderse.");
    } finally {
      setSaving(false);
    }
  }, []);

  function guardarTarea(estadoDestino, datos, idExistente) {
    const next = ESTADOS.reduce((acc, e) => ({ ...acc, [e.key]: [...board[e.key]] }), {});
    if (idExistente) {
      for (const e of ESTADOS) next[e.key] = next[e.key].filter((t) => t.id !== idExistente);
      next[estadoDestino] = [...next[estadoDestino], { ...datos, id: idExistente }];
    } else {
      next[estadoDestino] = [...next[estadoDestino], { ...datos, id: nuevoId() }];
    }
    persist(next);
    play("save");
    setFormOpen(null);
  }

  function eliminarTarea(estado, id) {
    persist({ ...board, [estado]: board[estado].filter((t) => t.id !== id) });
    play("delete");
  }

  function moverTarea(estado, id, direccion, sonido = "move") {
    const idx = idxEstado(estado);
    const nuevoIdx = idx + direccion;
    if (nuevoIdx < 0 || nuevoIdx >= ESTADOS.length) return;
    const tarea = board[estado].find((t) => t.id === id);
    persist({
      ...board,
      [estado]: board[estado].filter((t) => t.id !== id),
      [ESTADOS[nuevoIdx].key]: [...board[ESTADOS[nuevoIdx].key], tarea],
    });
    play(sonido);
  }

  function cambiarVista(v) {
    if (v !== view) {
      play("tab");
      setView(v);
    }
  }

  if (loading) {
    return (
      <div style={{ fontFamily: "'JetBrains Mono', monospace", padding: 40, color: "#6E7B87", background: "#0B0F14", minHeight: "100%" }}>
        cargando_tablero<span className="tp-cursor">_</span>
      </div>
    );
  }

  const pendientes = ordenarTareas(board["por-hacer"]);
  const todasLasTareas = ESTADOS.flatMap((e) => ordenarTareas(board[e.key]).map((t) => ({ ...t, estadoLabel: e.label })));
  const totalTareas = todasLasTareas.length;

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportarCSV() {
    const encabezados = ["Título", "Descripción", "Proyecto", "Prioridad", "Estado", "Fecha límite"];
    const filas = todasLasTareas.map((t) => [
      t.title, t.description || "", t.project, PRIORIDADES[t.priority].label, t.estadoLabel, t.dueDate || "",
    ]);
    const escapar = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [encabezados, ...filas].map((fila) => fila.map(escapar).join(",")).join("\n");
    descargar(`pendientes-tecnologia-${new Date().toISOString().slice(0, 10)}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8;");
    play("save");
  }

  function exportarJSON() {
    const json = JSON.stringify(board, null, 2);
    descargar(`pendientes-tecnologia-${new Date().toISOString().slice(0, 10)}.json`, json, "application/json");
    play("save");
  }

  async function sincronizarCorreo() {
    setSincronizando(true);
    try {
      const res = await fetch("/api/gmail-sync?manual=1");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok !== false) {
        setError(null);
        play("save");
        const actualizado = await storageGet(STORAGE_KEY);
        if (actualizado) setBoard(JSON.parse(actualizado.value));
        setMensajeSync(data?.nuevos ? `${data.nuevos} pendiente(s) nuevo(s) desde Gmail.` : "Sin pendientes nuevos en Gmail.");
      } else {
        setMensajeSync(`Error de Gmail: ${data?.error || "sin detalle"}`);
      }
    } catch (err) {
      setMensajeSync(`No se pudo conectar con /api/gmail-sync: ${err?.message || err}`);
    } finally {
      setSincronizando(false);
      setTimeout(() => setMensajeSync(null), 12000);
    }
  }

  return (
    <div className="tp-root">
      <GlobalStyles />

      <div className="tp-topbar">
        <div>
          <h1 className="tp-title">
            pendientes<span style={{ color: "#00E0D6" }}>.</span>tecnologia <span className="tp-title-dim">— Rogerson</span><span className="tp-cursor">_</span>
          </h1>
          <p className="tp-subtitle">tareas de trabajo · ordenado por prioridad y fecha · guardado en este navegador</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {saving && <span className="tp-saving">sincronizando…</span>}
          <button
            className="tp-icon-toggle"
            onClick={() => {
              toggleMuted();
              play("click");
            }}
            title={muted ? "Activar sonido" : "Silenciar"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>

      <div className="tp-tabs">
        <button className={`tp-tab ${view === "principal" ? "tp-tab-active" : ""}`} onClick={() => cambiarVista("principal")}>
          por hacer
          <span className="tp-tab-count">{String(pendientes.length).padStart(2, "0")}</span>
        </button>
        <button className={`tp-tab ${view === "tablero" ? "tp-tab-active" : ""}`} onClick={() => cambiarVista("tablero")}>
          <span className="tp-tab-group">
            en curso <span className="tp-tab-count">{String(board["en-curso"].length).padStart(2, "0")}</span>
          </span>
          <span className="tp-tab-dot">·</span>
          <span className="tp-tab-group">
            bloqueado <span className="tp-tab-count">{String(board["bloqueado"].length).padStart(2, "0")}</span>
          </span>
          <span className="tp-tab-dot">·</span>
          <span className="tp-tab-group">
            hecho <span className="tp-tab-count">{String(board["hecho"].length).padStart(2, "0")}</span>
          </span>
        </button>
        <button className={`tp-tab ${view === "informes" ? "tp-tab-active" : ""}`} onClick={() => cambiarVista("informes")}>
          informes
          <span className="tp-tab-count">{String(totalTareas).padStart(2, "0")}</span>
        </button>
      </div>

      {error && <div className="tp-error">{error}</div>}

      {view === "principal" ? (
        <div className="tp-principal">
          <button
            className="tp-add-btn tp-add-btn-lg"
            onClick={() => {
              play("open");
              setFormOpen({ estado: "por-hacer" });
            }}
          >
            <Plus size={15} /> Añadir tarea
          </button>

          {pendientes.length === 0 && <p className="tp-empty">Nada pendiente por ahora.</p>}

          <div className="tp-principal-list">
            {pendientes.map((t) => (
              <div className="tp-card tp-card-wide" key={t.id}>
                <div className="tp-card-top">
                  <span className="tp-card-title">{t.title}</span>
                  <Circle size={8} fill={PRIORIDADES[t.priority].color} color={PRIORIDADES[t.priority].color} className="tp-priority-dot" />
                </div>

                {t.description && <p className="tp-card-desc">{t.description}</p>}

                <div className="tp-tags">
                  {t.project && <span className="tp-tag">{t.project}</span>}
                  {t.dueDate && <span className="tp-tag">{t.dueDate}</span>}
                  {t.source && t.source !== "manual" && (
                    <span className={`tp-tag tp-tag-fuente tp-tag-fuente-${t.source}`}>{t.source}</span>
                  )}
                </div>

                <div className="tp-card-actions">
                  <button className="tp-btn-start" onClick={() => moverTarea("por-hacer", t.id, 1, "start")}>
                    Iniciar <ArrowRight size={13} />
                  </button>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button
                      className="tp-btn-icon"
                      onClick={() => {
                        play("open");
                        setFormOpen({ estado: "por-hacer", task: t });
                      }}
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button className="tp-btn-icon" onClick={() => eliminarTarea("por-hacer", t.id)} title="Eliminar">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : view === "tablero" ? (
        <div className="tp-board">
          {COLUMNAS_TABLERO.map((estado) => {
            const colIdx = idxEstado(estado.key);
            const tareas = ordenarTareas(board[estado.key]);
            return (
              <div className="tp-column" key={estado.key}>
                <div className="tp-col-header" style={{ "--col-color": estado.color }}>
                  <span className="tp-col-label">{estado.label}</span>
                  <span className="tp-col-count">{String(tareas.length).padStart(2, "0")}</span>
                </div>

                <div className="tp-col-body">
                  {tareas.map((t) => (
                    <div className="tp-card" key={t.id}>
                      <div className="tp-card-top">
                        <span className="tp-card-title">{t.title}</span>
                        <Circle size={8} fill={PRIORIDADES[t.priority].color} color={PRIORIDADES[t.priority].color} className="tp-priority-dot" />
                      </div>

                      {t.description && <p className="tp-card-desc">{t.description}</p>}

                      <div className="tp-tags">
                        {t.project && <span className="tp-tag">{t.project}</span>}
                        {t.dueDate && <span className="tp-tag">{t.dueDate}</span>}
                        {t.source && t.source !== "manual" && (
                          <span className={`tp-tag tp-tag-fuente tp-tag-fuente-${t.source}`}>{t.source}</span>
                        )}
                      </div>

                      <div className="tp-card-actions">
                        <div style={{ display: "flex", gap: 2 }}>
                          <button
                            className="tp-btn-icon"
                            disabled={colIdx === 0}
                            onClick={() => moverTarea(estado.key, t.id, -1)}
                            title="Mover a la izquierda"
                          >
                            <ChevronLeft size={15} />
                          </button>
                          <button
                            className="tp-btn-icon"
                            disabled={colIdx === ESTADOS.length - 1}
                            onClick={() => moverTarea(estado.key, t.id, 1)}
                            title="Mover a la derecha"
                          >
                            <ChevronRight size={15} />
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button
                            className="tp-btn-icon"
                            onClick={() => {
                              play("open");
                              setFormOpen({ estado: estado.key, task: t });
                            }}
                            title="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                          <button className="tp-btn-icon" onClick={() => eliminarTarea(estado.key, t.id)} title="Eliminar">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    className="tp-add-btn"
                    onClick={() => {
                      play("open");
                      setFormOpen({ estado: estado.key });
                    }}
                  >
                    <Plus size={14} /> Añadir tarea
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tp-informes">
          <div className="tp-export-row">
            <button className="tp-export-btn" onClick={exportarCSV}>
              <Download size={14} /> exportar_csv
            </button>
            <button className="tp-export-btn" onClick={exportarJSON}>
              <Download size={14} /> exportar_json
            </button>
            <button className="tp-export-btn" onClick={sincronizarCorreo} disabled={sincronizando}>
              <RefreshCw size={14} className={sincronizando ? "tp-spin" : ""} /> {sincronizando ? "sincronizando…" : "sincronizar_correo"}
            </button>
            {mensajeSync && <span className="tp-sync-msg">{mensajeSync}</span>}
          </div>

          <div className="tp-stats-row">
            {ESTADOS.map((e) => (
              <div className="tp-stat-card" key={e.key} style={{ "--col-color": e.color }}>
                <span className="tp-stat-num">{String(board[e.key].length).padStart(2, "0")}</span>
                <span className="tp-stat-label">{e.label}</span>
              </div>
            ))}
            <div className="tp-stat-card tp-stat-total">
              <span className="tp-stat-num">{String(totalTareas).padStart(2, "0")}</span>
              <span className="tp-stat-label">Total</span>
            </div>
          </div>

          {totalTareas === 0 ? (
            <p className="tp-empty">No hay tareas registradas todavía.</p>
          ) : (
            <div className="tp-table-wrap">
              <table className="tp-table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Proyecto</th>
                    <th>Prioridad</th>
                    <th>Estado</th>
                    <th>Fecha límite</th>
                  </tr>
                </thead>
                <tbody>
                  {todasLasTareas.map((t) => (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td className="tp-td-muted">{t.project || "—"}</td>
                      <td>
                        <span className="tp-pill" style={{ "--pill-color": PRIORIDADES[t.priority].color }}>
                          {PRIORIDADES[t.priority].label}
                        </span>
                      </td>
                      <td className="tp-td-muted">{t.estadoLabel}</td>
                      <td className="tp-td-muted">{t.dueDate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <TaskForm
          estadoInicial={formOpen.estado}
          task={formOpen.task}
          onCancel={() => {
            play("click");
            setFormOpen(null);
          }}
          onSave={guardarTarea}
          onSound={play}
        />
      )}
    </div>
  );
}

function TaskForm({ estadoInicial, task, onCancel, onSave, onSound }) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [project, setProject] = useState(task?.project || PROYECTOS[0]);
  const [priority, setPriority] = useState(task?.priority || "media");
  const [dueDate, setDueDate] = useState(task?.dueDate || "");
  const [estado, setEstado] = useState(task?.status || estadoInicial);

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(estado, { title: title.trim(), description: description.trim(), project, priority, dueDate, status: estado }, task?.id);
  }

  return (
    <div className="tp-overlay" onClick={onCancel}>
      <form className="tp-modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div className="tp-modal-head">
          <h2 className="tp-modal-title">{task ? "editar_tarea" : "nueva_tarea"}</h2>
          <button type="button" className="tp-btn-icon" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <label className="tp-field">
          título
          <input className="tp-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </label>

        <label className="tp-field">
          descripción
          <textarea className="tp-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <label className="tp-field">
          proyecto
          <select className="tp-select" value={project} onChange={(e) => setProject(e.target.value)}>
            {PROYECTOS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <label className="tp-field" style={{ flex: 1 }}>
            prioridad
            <select className="tp-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORIDADES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="tp-field" style={{ flex: 1 }}>
            fecha límite
            <input type="date" className="tp-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>

        <label className="tp-field">
          estado
          <select className="tp-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
        </label>

        <div className="tp-modal-actions">
          <button type="button" className="tp-btn-secondary" onClick={onCancel}>
            cancelar
          </button>
          <button type="submit" className="tp-btn-primary" onClick={() => onSound("click")}>
            guardar →
          </button>
        </div>
      </form>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

      .tp-root {
        font-family: 'JetBrains Mono', monospace;
        background:
          radial-gradient(circle at 1px 1px, rgba(0,224,214,0.09) 1px, transparent 0) 0 0 / 28px 28px,
          #0B0F14;
        min-height: 100%;
        padding: 26px 24px 40px;
        color: #DCE4EA;
      }

      .tp-topbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
      .tp-title { font-family: 'Space Grotesk', sans-serif; font-size: 21px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
      .tp-title-dim { color: #6E7B87; font-weight: 500; }
      .tp-subtitle { margin: 5px 0 0; font-size: 12px; color: #6E7B87; }
      .tp-saving { font-size: 11px; color: #00E0D6; }
      .tp-cursor { display: inline-block; color: #00E0D6; animation: tp-blink 1s step-end infinite; }
      @keyframes tp-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }

      .tp-icon-toggle {
        background: #121820; border: 1px solid #212B36; color: #6E7B87;
        border-radius: 6px; padding: 7px; cursor: pointer; display: flex;
        transition: border-color .15s ease, color .15s ease, transform .1s ease;
      }
      .tp-icon-toggle:hover { border-color: #00E0D6; color: #00E0D6; }
      .tp-icon-toggle:active { transform: scale(0.92); }

      .tp-tabs { display: flex; gap: 4px; border-bottom: 1px solid #1B232D; margin-bottom: 20px; }
      .tp-tab {
        background: none; border: none; cursor: pointer;
        font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #6E7B87;
        padding: 10px 4px; margin-right: 22px; position: relative;
        display: flex; align-items: center; gap: 8px;
        border-bottom: 2px solid transparent; margin-bottom: -1px;
        transition: color .15s ease, border-color .2s ease;
      }
      .tp-tab:hover { color: #DCE4EA; }
      .tp-tab-active { color: #00E0D6; border-bottom-color: #00E0D6; }
      .tp-tab-count {
        font-size: 10px; color: #6E7B87; background: #121820; border: 1px solid #212B36;
        border-radius: 3px; padding: 1px 5px;
      }
      .tp-tab-active .tp-tab-count { color: #00E0D6; border-color: rgba(0,224,214,0.4); }
      .tp-tab-group { display: flex; align-items: center; gap: 6px; }
      .tp-tab-dot { color: #364454; }

      .tp-error {
        background: rgba(255,61,129,0.1); border: 1px solid rgba(255,61,129,0.35);
        color: #FF7FAB; border-radius: 6px; padding: 8px 12px; font-size: 12px; margin-bottom: 16px;
      }

      .tp-principal { animation: tp-view-in 0.22s ease; max-width: 620px; }
      .tp-board { animation: tp-view-in 0.22s ease; display: grid; grid-template-columns: repeat(3, minmax(240px, 1fr)); gap: 16px; overflow-x: auto; }
      @keyframes tp-view-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

      .tp-empty { color: #6E7B87; font-size: 12px; margin: 18px 2px; }
      .tp-principal-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }

      .tp-col-header {
        display: flex; justify-content: space-between; align-items: center;
        padding-bottom: 9px; margin-bottom: 12px;
        border-bottom: 2px solid var(--col-color);
        box-shadow: 0 1px 8px -2px var(--col-color);
      }
      .tp-col-label { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 12.5px; text-transform: lowercase; letter-spacing: 0.02em; }
      .tp-col-count { font-size: 11px; color: #6E7B87; }

      .tp-col-body { display: flex; flex-direction: column; gap: 10px; min-height: 40px; }

      .tp-card {
        background: #121820;
        border: 1px solid #212B36;
        border-radius: 8px;
        padding: 12px 12px 10px;
        animation: tp-card-in 0.32s cubic-bezier(.2,.8,.3,1);
        transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease;
      }
      .tp-card:hover {
        border-color: #00E0D6;
        transform: translateY(-2px);
        box-shadow: 0 8px 20px -10px rgba(0,224,214,0.35);
      }
      .tp-card-wide { padding: 14px 14px 12px; }
      @keyframes tp-card-in {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .tp-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .tp-card-title { font-family: 'Space Grotesk', sans-serif; font-size: 13.5px; font-weight: 500; line-height: 1.35; color: #EDF2F5; }
      .tp-priority-dot { margin-top: 4px; flex-shrink: 0; filter: drop-shadow(0 0 3px currentColor); }
      .tp-card-desc { font-size: 11.5px; color: #8A96A3; margin: 6px 0 0; line-height: 1.45; }

      .tp-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
      .tp-tag-fuente { text-transform: uppercase; letter-spacing: 0.04em; font-size: 9.5px; }
      .tp-tag-fuente-trello { color: #5EA8FF; border-color: rgba(94,168,255,0.4); background: rgba(94,168,255,0.08); }
      .tp-tag-fuente-gmail { color: #FF3D81; border-color: rgba(255,61,129,0.4); background: rgba(255,61,129,0.08); }
      .tp-tag { font-size: 10.5px; background: #0E141B; border: 1px solid #212B36; color: #8A96A3; border-radius: 4px; padding: 2px 7px; }

      .tp-card-actions {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: 10px; border-top: 1px solid #1B232D; padding-top: 8px;
      }

      .tp-btn-start {
        display: flex; align-items: center; gap: 5px;
        background: rgba(0,224,214,0.1); border: 1px solid rgba(0,224,214,0.35);
        color: #00E0D6; border-radius: 5px; padding: 5px 9px; cursor: pointer;
        font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500;
        transition: background .15s ease, transform .1s ease;
      }
      .tp-btn-start:hover { background: rgba(0,224,214,0.18); }
      .tp-btn-start:active { transform: scale(0.95); }

      .tp-btn-icon {
        background: none; border: none; cursor: pointer; padding: 4px;
        border-radius: 4px; color: #6E7B87; display: flex;
        transition: background .12s ease, color .12s ease, transform .08s ease;
      }
      .tp-btn-icon:hover:not(:disabled) { background: rgba(0,224,214,0.1); color: #00E0D6; }
      .tp-btn-icon:active:not(:disabled) { transform: scale(0.88); }
      .tp-btn-icon:disabled { opacity: 0.22; cursor: default; }

      .tp-add-btn {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        background: none; border: 1px dashed #263140; border-radius: 8px;
        padding: 9px 12px; width: 100%; cursor: pointer;
        font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #6E7B87;
        transition: border-color .15s ease, color .15s ease, background .15s ease;
      }
      .tp-add-btn:hover { border-color: #00E0D6; color: #00E0D6; background: rgba(0,224,214,0.05); }
      .tp-add-btn:active { transform: scale(0.98); }
      .tp-add-btn-lg { margin-bottom: 4px; padding: 11px 12px; font-size: 12.5px; }

      .tp-overlay {
        position: fixed; inset: 0; background: rgba(6,9,12,0.7); backdrop-filter: blur(3px);
        display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px;
        animation: tp-fade-in 0.18s ease;
      }
      @keyframes tp-fade-in { from { opacity: 0; } to { opacity: 1; } }

      .tp-modal {
        background: #121820; border: 1px solid #212B36; border-radius: 10px;
        padding: 22px; width: 380px; max-width: 100%;
        display: flex; flex-direction: column; gap: 12px;
        font-family: 'JetBrains Mono', monospace;
        box-shadow: 0 0 0 1px rgba(0,224,214,0.08), 0 20px 50px -20px rgba(0,224,214,0.25);
        animation: tp-modal-in 0.24s cubic-bezier(.2,.8,.3,1);
      }
      @keyframes tp-modal-in {
        from { opacity: 0; transform: scale(0.95) translateY(6px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      .tp-modal-head { display: flex; justify-content: space-between; align-items: center; }
      .tp-modal-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 600; margin: 0; color: #EDF2F5; }

      .tp-field { font-size: 11px; color: #6E7B87; display: flex; flex-direction: column; gap: 4px; }

      .tp-input, .tp-select, .tp-textarea {
        font-family: 'JetBrains Mono', monospace;
        width: 100%; border: 1px solid #212B36; border-radius: 6px;
        padding: 8px 10px; font-size: 13px; color: #DCE4EA;
        background: #0E141B; box-sizing: border-box;
        transition: border-color .15s ease, box-shadow .15s ease;
      }
      .tp-textarea { min-height: 60px; resize: vertical; }
      .tp-input:focus, .tp-select:focus, .tp-textarea:focus {
        outline: none; border-color: #00E0D6; box-shadow: 0 0 0 3px rgba(0,224,214,0.14);
      }

      .tp-modal-actions { display: flex; gap: 8px; margin-top: 6px; }
      .tp-btn-secondary, .tp-btn-primary {
        flex: 1; padding: 9px 0; border-radius: 6px; cursor: pointer;
        font-size: 12.5px; font-family: 'JetBrains Mono', monospace; font-weight: 500;
        transition: transform .1s ease, filter .15s ease;
      }
      .tp-btn-secondary { border: 1px solid #212B36; background: #0E141B; color: #8A96A3; }
      .tp-btn-secondary:hover { color: #DCE4EA; border-color: #354254; }
      .tp-btn-primary { border: none; background: #00E0D6; color: #0B0F14; }
      .tp-btn-primary:hover { filter: brightness(1.1); }
      .tp-btn-secondary:active, .tp-btn-primary:active { transform: scale(0.96); }

      .tp-informes { animation: tp-view-in 0.22s ease; }

      .tp-export-row { display: flex; gap: 10px; margin-bottom: 20px; }
      .tp-export-btn {
        display: flex; align-items: center; gap: 7px;
        background: #121820; border: 1px solid #212B36; color: #DCE4EA;
        border-radius: 6px; padding: 9px 14px; cursor: pointer;
        font-family: 'JetBrains Mono', monospace; font-size: 12px;
        transition: border-color .15s ease, color .15s ease, transform .1s ease;
      }
      .tp-export-btn:hover { border-color: #00E0D6; color: #00E0D6; }
      .tp-export-btn:active { transform: scale(0.96); }
      .tp-export-btn:disabled { opacity: 0.6; cursor: default; }
      .tp-spin { animation: tp-spin 0.9s linear infinite; }
      @keyframes tp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .tp-sync-msg { font-size: 11px; color: #6E7B87; align-self: center; }

      .tp-stats-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
      .tp-stat-card {
        background: #121820; border: 1px solid #212B36; border-top: 2px solid var(--col-color, #354254);
        border-radius: 8px; padding: 12px 16px; min-width: 110px;
        display: flex; flex-direction: column; gap: 4px;
      }
      .tp-stat-num { font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 600; color: #EDF2F5; }
      .tp-stat-label { font-size: 11px; color: #6E7B87; }
      .tp-stat-total { border-top-color: #00E0D6; }

      .tp-table-wrap { border: 1px solid #212B36; border-radius: 8px; overflow: auto; }
      .tp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .tp-table th {
        text-align: left; font-family: 'Space Grotesk', sans-serif; font-weight: 600;
        font-size: 11px; color: #6E7B87; padding: 10px 14px; background: #121820;
        border-bottom: 1px solid #212B36; position: sticky; top: 0;
      }
      .tp-table td { padding: 10px 14px; border-bottom: 1px solid #1B232D; color: #DCE4EA; }
      .tp-table tr:last-child td { border-bottom: none; }
      .tp-table tr:hover td { background: rgba(0,224,214,0.04); }
      .tp-td-muted { color: #8A96A3; }
      .tp-pill {
        font-size: 10.5px; color: var(--pill-color); border: 1px solid var(--pill-color);
        border-radius: 4px; padding: 2px 7px; white-space: nowrap;
      }

      @media (max-width: 900px) {
        .tp-board { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
