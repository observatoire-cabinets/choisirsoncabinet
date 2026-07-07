/** Formatage FR JJ/MM/AAAA. Gère "YYYY-MM-DD" et l'ISO complet sans dérive de fuseau. */
export function frDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  // Repli non-ISO : échappé, car les libellés de date sont interpolés en HTML.
  return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(iso);
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Échappe le HTML — les libellés (noms de cabinets/structures/adresses) viennent de données. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}
