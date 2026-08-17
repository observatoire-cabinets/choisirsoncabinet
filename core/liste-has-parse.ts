/**
 * Analyseur du texte de la liste HAS des organismes autorisés (ESSMS).
 * Implémentation pure : string → état structuré. La clé d'identité est le
 * SIREN ; le nom est du texte libre ; le numéro d'accréditation (section 3,
 * motif 3-\d{3,4}) est absent pour les organismes sans accréditation.
 * Deux mises en page couvertes : 2022 (enregistrement monoligne, SIREN en
 * fin de ligne) et 2023+ (un champ par ligne, le SIREN clôt le bloc).
 */

export interface ListeHasOrganisme {
  siren: string;
  nom: string;
  /** Numéro d'accréditation section 3 (3-XXX ou 3-XXXX), '' si absent. */
  num: string;
  dept: string;
}

/**
 * Un état de la liste. Champs snake_case : interopérabilité avec les états
 * JSON déjà archivés (amorce embarquée) — ne pas renommer.
 */
export interface ListeHasEtat {
  /** Date que le document revendique (« Actualisée le … »), texte brut. */
  date_source: string | null;
  organismes: ListeHasOrganisme[];
  /** Date du relevé YYYY-MM-DD (posée par la collecte, pas par l'analyseur). */
  date_releve: string;
  /** Empreinte SHA-256 du PDF brut (posée par la collecte). */
  sha256: string;
}

const RE_SIREN_ALONE = /^\s*(\d{9})\s*$/;
const RE_NUMERO = /(?<!\d)(3-\d{3,4})(?!\d)/;
const RE_DEPT = /^\s*(\d{2,3}|2A|2B)\s+[-–]\s+(.+?)\s*$/;
const RE_ACTUALISEE = /Actualis[ée]e?\s+le\s+(.{0,30})/i;
const RE_PAGE = /^\s*\d{1,3}\s*$/;
const RE_SIREN_EOL = /^(.*\S)\s+(\d{9})\s*$/;

// Début d'adresse dans une ligne : coupe le nom (mise en page 2022 surtout).
const RE_DEBUT_ADRESSE = new RegExp(
  '(?:' +
    // numéro de voie suivi d'un type de voie
    '\\s*\\b\\d{1,4}\\s?(?:BIS|TER)?\\s+(?:RUE|AVENUE|AV|BOULEVARD|BD|CHEMIN|CHE|CHS' +
    '|ALL[EÉ]E|ALL|PLACE|PL|IMPASSE|IMP|QUAI|ROUTE|RTE|COURS|CRS|VILLA|VLA' +
    '|SQUARE|SQ|MAIL|VOIE|VC|ESPLANADE|R[EÉ]SIDENCE|RES|PARC|HAM|LD|LIEU-DIT)\\b' +
    // type de voie sans numéro (sans ambiguïté dans une raison sociale)
    '|\\s*\\b(?:RUE|AVENUE|AV|BOULEVARD|BD|CHEMIN|CHE|CHS|ALL[EÉ]E|IMPASSE|IMP' +
    '|QUAI|ROUTE|RTE|CRS|VLA|SQ|VC|ZI|ZA|ZAC|CS|BP|PIST|LIEU-DIT|R[EÉ]SIDENCE)\\b' +
    // petit nombre isolé au milieu du texte = numéro de voie
    '|\\s+\\d{1,4}\\s+(?=[A-ZÀ-Ÿ])' +
    // code postal, y compris collé au mot précédent
    '|(?<!\\d)\\d{5}(?!\\d)' +
    '|\\s*France\\b' +
    ')',
  'i',
);

function couperAvantAdresse(ligne: string): string {
  const m = RE_DEBUT_ADRESSE.exec(ligne);
  return (m ? ligne.slice(0, m.index) : ligne).trim();
}

// Ligne « code postal » : dernière ligne d'un segment d'adresse (2023+).
const RE_CP_TETE = /^\d{5}(?!\d)/;

/**
 * Défense contre la fusion de blocs : un enregistrement SANS ligne SIREN se
 * colle au suivant, et son nom serait attribué au SIREN du suivant. Signature
 * de la fusion : AU MOINS DEUX segments d'adresse complets (deux lignes code
 * postal) séparés par des lignes-noms. Le nom du SIREN est alors extrait du
 * bloc qui suit l'avant-dernier code postal (le DERNIER enregistrement).
 * Une ligne après le DERNIER code postal (« SAINT-PAUL-TROIS- » puis
 * « CHÂTEAUX ») est une continuation d'adresse, pas une fusion : la fusion
 * exige un second code postal après elle.
 */
function blocDuDernierEnregistrement(bloc: string[]): string[] {
  const idxCp: number[] = [];
  for (let i = 0; i < bloc.length; i++) {
    if (RE_CP_TETE.test(bloc[i])) idxCp.push(i);
  }
  if (idxCp.length < 2) return bloc;
  const avantDernier = idxCp[idxCp.length - 2];
  const dernier = idxCp[idxCp.length - 1];
  const fusion = bloc
    .slice(avantDernier + 1, dernier)
    .some((l) => couperAvantAdresse(l) !== '');
  return fusion ? bloc.slice(avantDernier + 1) : bloc;
}

/** Analyse le texte extrait du PDF. date_releve/sha256 sont posés vides ici. */
export function parseListeHasText(texte: string): ListeHasEtat {
  // Mise en page 2022 : détacher le SIREN de fin de ligne pour que la logique
  // commune (« le SIREN clôt l'enregistrement ») s'applique.
  const lignes: string[] = [];
  for (const ligne of texte.split('\n')) {
    const m = RE_SIREN_EOL.exec(ligne);
    if (m && RE_DEBUT_ADRESSE.test(m[1])) {
      lignes.push(m[1]);
      lignes.push(m[2]);
    } else {
      lignes.push(ligne);
    }
  }

  const mDate = RE_ACTUALISEE.exec(texte);
  const date_source = mDate ? mDate[1].trim().split('\n')[0].trim() : null;

  const organismes: ListeHasOrganisme[] = [];
  let tampon: string[] = [];
  let dept = '';

  for (const ligne of lignes) {
    const brut = ligne.trim();

    const mSiren = RE_SIREN_ALONE.exec(ligne);
    if (mSiren) {
      // Fin d'enregistrement : le SIREN clôt le bloc.
      const bloc = tampon.filter(Boolean);
      let numero = '';
      for (const x of bloc) {
        const mn = RE_NUMERO.exec(x);
        if (mn) {
          numero = mn[1];
          break;
        }
      }
      // Le nom : tout ce qui précède le numéro ou l'adresse — dans le DERNIER
      // enregistrement du bloc si une fusion est détectée (double adresse).
      const blocNom = blocDuDernierEnregistrement(bloc);
      const noms: string[] = [];
      for (const x of blocNom) {
        if (RE_NUMERO.test(x)) {
          const reste = couperAvantAdresse(x.replace(RE_NUMERO, ''));
          if (reste) noms.push(reste);
          break;
        }
        const part = couperAvantAdresse(x);
        if (!part) break;
        noms.push(part);
      }
      const nom = noms.join(' ').trim();
      if (nom) organismes.push({ siren: mSiren[1], nom, num: numero, dept });
      tampon = [];
      continue;
    }

    // Numéro de page isolé : n'appartient à aucun enregistrement.
    if (RE_PAGE.test(ligne)) continue;

    // « France » clôt l'adresse — ignorer SANS vider le tampon.
    if (brut.toLowerCase() === 'france') continue;

    // En-têtes de colonnes = nouveau bloc.
    const haut = brut.toUpperCase();
    if (
      haut.startsWith('NOM DES ORGANISMES') ||
      haut.startsWith("D'ACCRÉDITATION") ||
      haut.startsWith("D'ACCREDITATION") ||
      haut.includes('ADRESSE POSTALE')
    ) {
      tampon = [];
      continue;
    }

    const mDept = RE_DEPT.exec(brut);
    if (mDept && brut.length < 40) {
      dept = mDept[1];
      tampon = [];
      continue;
    }

    tampon.push(brut);
  }

  return { date_source, organismes, date_releve: '', sha256: '' };
}
