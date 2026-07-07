// Config PostCSS vide, locale à l'app : court-circuite la recherche ascendante de
// Vite qui remonterait sinon jusqu'au postcss.config.mjs (Tailwind) du projet racine.
module.exports = { plugins: [] };
