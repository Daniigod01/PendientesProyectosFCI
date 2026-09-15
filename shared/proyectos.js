export const PROYECTOS = [
  "Nos mueve la ruta de oportunidades (Alcaldía de Malambo)",
  "Mujeres, equidad y empleo (Fondo Mujer)",
  "Mujeres + (Gobernación del Atlántico)",
  "PXR (Bogotá)",
  "Ruta Mujer (Colsubsidio)",
  "Incluyete + (Barranquilla)",
  "Con Vos cuidarte (Cali)",
  "Ruta de fortalecimiento empresarial (Colsubsidio)",
  "Proyecto Talento sin fronteras (GIZ)",
];

// Palabras clave cortas por proyecto, para reconocerlo en el asunto/cuerpo
// de un correo aunque no venga el nombre completo tal cual.
export const ALIAS_PROYECTOS = {
  "Nos mueve la ruta de oportunidades (Alcaldía de Malambo)": ["nos mueve la ruta", "malambo", "nmlr"],
  "Mujeres, equidad y empleo (Fondo Mujer)": ["mujeres, equidad y empleo", "fondo mujer"],
  "Mujeres + (Gobernación del Atlántico)": ["mujeres +", "gobernación del atlántico", "gobernacion del atlantico"],
  "PXR (Bogotá)": ["pxr"],
  "Ruta Mujer (Colsubsidio)": ["ruta mujer"],
  "Incluyete + (Barranquilla)": ["incluyete +", "incluyete más", "incluyete mas"],
  "Con Vos cuidarte (Cali)": ["con vos cuidarte"],
  "Ruta de fortalecimiento empresarial (Colsubsidio)": ["ruta de fortalecimiento empresarial", "fortalecimiento empresarial"],
  "Proyecto Talento sin fronteras (GIZ)": ["talento sin fronteras"],
};

// Busca si alguno de los proyectos (o sus alias) aparece en el texto dado.
// Devuelve el nombre completo del proyecto o null si no encuentra nada.
export function proyectoMencionado(texto) {
  const t = (texto || "").toLowerCase();
  for (const proyecto of PROYECTOS) {
    const alias = ALIAS_PROYECTOS[proyecto] || [];
    if (t.includes(proyecto.toLowerCase()) || alias.some((a) => t.includes(a))) {
      return proyecto;
    }
  }
  return null;
}
