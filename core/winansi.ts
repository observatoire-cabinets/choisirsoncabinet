/**
 * Sanitisation WinAnsi (Windows-1252) partagee par les generateurs PDF qui
 * embarquent les StandardFonts pdf-lib (Helvetica), lesquelles ne supportent
 * que l'encodage WinAnsi. Tout caractere hors plage (emoji, CJK, fleches,
 * espaces fines insecables, etc.) fait throw pdf-lib au drawText/widthOfText.
 *
 * C'est un guard architectural PERMANENT — pas un contournement. Si un jour on
 * embarque une police TTF Unicode complete, cette fonction devient un no-op.
 *
 * Extrait du generateur PDF pour etre reutilise
 * a l'identique par les exports courrier/recours en PDF.
 */
export function sanitizeForWinAnsi(text: string): string {
  return text
    // Smart quotes -> straight quotes
    .replace(/[‘’‚]/g, "'") // ' ' , -> '
    .replace(/[“”„]/g, '"') // " " „ -> "
    // Dashes
    .replace(/–/g, '-') // en-dash -> -
    .replace(/—/g, ' - ') // em-dash -> " - "
    // Ellipsis
    .replace(/…/g, '...') // … -> ...
    // Non-breaking space -> regular space
    .replace(/ /g, ' ')
    // Bullet
    .replace(/•/g, '-') // • -> -
    // OE ligature (supported in WinAnsi as \x8C/\x9C but pdf-lib may choke)
    .replace(/Œ/g, 'OE') // Œ -> OE
    .replace(/œ/g, 'oe') // œ -> oe
    // Symboles fréquents hors WinAnsi : on les TRANSLITTÈRE plutôt que de les
    // supprimer (sinon « ≥ 30 » devient «  30 », « Δ vs » devient «  vs », etc.).
    .replace(/[≥]/g, '>=') // ≥ -> >=
    .replace(/[≤]/g, '<=') // ≤ -> <=
    .replace(/[→]/g, '->') // → -> ->
    .replace(/[←]/g, '<-') // ← -> <-
    .replace(/[Δ]/g, 'Delta') // Δ -> Delta
    // Chiffres cerclés (numérotation de volet) hors WinAnsi.
    .replace(/①/g, '1.') // ① -> 1.
    .replace(/②/g, '2.') // ② -> 2.
    .replace(/③/g, '3.') // ③ -> 3.
    // Remove any remaining characters outside WinAnsi range (0x00-0xFF minus control chars).
    // This catches edge cases from LLM outputs (emoji, CJK, arrows, narrow no-break
    // space U+202F, etc.) without breaking the PDF.
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}
