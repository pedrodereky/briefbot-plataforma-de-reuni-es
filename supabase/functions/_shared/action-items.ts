/**
 * Interpretação dos action items devolvidos pela IA.
 *
 * Fica separado de index.ts porque aquele arquivo importa de esm.sh, o que
 * impede o vitest de carregá-lo. O formato é frágil por natureza — um regex
 * sobre texto livre de um modelo de linguagem (auditoria P2 item 16) — então é
 * exatamente o tipo de código que precisa de teste.
 *
 * Formato esperado, uma ocorrência por linha:
 *     [RESPONSÁVEL] → [AÇÃO] → [PRAZO]
 * ou a palavra NENHUM quando não há item.
 */

export interface ActionItem {
  owner: string;
  task: string;
  due_date: string | null;
}

export function parseActionItems(text: string): ActionItem[] {
  if (text.trim() === "NENHUM") return [];
  const items: ActionItem[] = [];
  const regex = /\[([^\]]+)\]\s*→\s*\[([^\]]+)\]\s*→\s*\[([^\]]*)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const owner = match[1].trim();
    const task = match[2].trim();
    const rawDate = match[3].trim();
    let due_date: string | null = null;
    if (rawDate && rawDate.toLowerCase() !== "sem prazo" && rawDate !== "-") {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        due_date = parsed.toISOString().split("T")[0];
      }
    }
    items.push({ owner, task, due_date });
  }
  return items;
}
