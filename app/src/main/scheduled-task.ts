/**
 * Tâche planifiée Windows par utilisateur : lance l'application en mode
 * --collecte chaque jour. Enregistrement par XML importé (Register-ScheduledTask)
 * pour obtenir StartWhenAvailable (rattrapage si le poste était éteint) —
 * schtasks /create ne sait pas l'activer.
 * Ce module n'importe PAS electron en valeur (testable sous vitest racine) :
 * l'appelant fournit le chemin de l'exécutable.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pExecFile = promisify(execFile);

export const TASK_NAME = 'Observatoire Cabinets - Collecte quotidienne';

// Contenu d'ÉLÉMENT XML : seuls & et < doivent être échappés — l'apostrophe
// du nom de produit (« d'ESSMS ») reste brute, c'est du texte, pas un attribut.
const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Quotes SIMPLES PowerShell (littérales : aucune expansion $/`` ) pour les
// chemins insérés dans la commande — les apostrophes internes s'échappent par
// doublement. Nécessaire : en quotes doubles, un TEMP contenant un $ (compte
// Windows du type « jean$marc ») serait développé par PowerShell, provoquant
// un échec silencieux et permanent du register.
const psq = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** Heure de collecte aléatoire par poste (graine stable), 06:00–21:59. */
export function tirerHeureCollecte(graine: string): { heure: number; minute: number } {
  const h = createHash('sha256').update(graine).digest();
  return { heure: 6 + (h[0] % 16), minute: h[1] % 60 };
}

export function buildTaskXml(exePath: string, heure: number, minute: number): string {
  const hh = String(heure).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Collecte quotidienne des donnees publiques (liste HAS, COFRAC) pour l'application Observatoire.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T${hh}:${mm}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <StartWhenAvailable>true</StartWhenAvailable>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEscape(exePath)}</Command>
      <Arguments>--collecte</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

/**
 * Enregistre (ou remplace) la tâche pour l'utilisateur courant. Jamais de throw.
 * L'heure est fournie par l'appelant : c'est `settings.collecteHeure` (source
 * de vérité persistée, tirée une fois via tirerHeureCollecte) qui fait foi.
 */
export async function registerScheduledTask(
  exePath: string,
  heureCollecte: { heure: number; minute: number },
): Promise<boolean> {
  const xml = buildTaskXml(exePath, heureCollecte.heure, heureCollecte.minute);
  const xmlPath = join(tmpdir(), 'obs-collecte-task.xml');
  try {
    // UTF-16 LE avec BOM : format attendu par le Planificateur pour un XML de tâche.
    await writeFile(xmlPath, '\ufeff' + xml, { encoding: 'utf16le' });
    await pExecFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Register-ScheduledTask -TaskName "${TASK_NAME}" -Xml (Get-Content -Raw -Encoding Unicode -LiteralPath ${psq(xmlPath)}) -Force`,
    ]);
    return true;
  } catch {
    return false; // l'échec est silencieux : la collecte app-ouverte reste assurée
  } finally {
    await rm(xmlPath, { force: true });
  }
}

export async function unregisterScheduledTask(): Promise<void> {
  try {
    await pExecFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Unregister-ScheduledTask -TaskName "${TASK_NAME}" -Confirm:$false`,
    ]);
  } catch {
    // tâche absente : rien à faire
  }
}
