import type { ActivityLog } from './activity-api';

type TranslationFunction = (key: string, values?: Record<string, string | number>) => string;

/**
 * Formate le temps écoulé depuis une date de manière relative
 */
export function formatTimeAgo(dateString: string, t: TranslationFunction): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return t('timeAgo.justNow');
  if (diffMinutes < 60) return t('timeAgo.minutesAgo', { count: diffMinutes });
  if (diffHours < 24) return t('timeAgo.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('timeAgo.daysAgo', { count: diffDays });
  if (diffWeeks < 4) return t('timeAgo.weeksAgo', { count: diffWeeks });
  return t('timeAgo.monthsAgo', { count: diffMonths });
}

/**
 * Extrait les métadonnées spécifiques selon le type d'activité
 */
function extractMetadata(log: ActivityLog): Record<string, string | number> {
  const metadata = log.metadata || {};
  const result: Record<string, string | number> = {};

  switch (log.type) {
    case 'NODE_CREATED':
      result.columnName = String(metadata.columnName || '');
      break;

    case 'NODE_MOVED':
      result.fromColumn = String(
        metadata.fromColumnName || metadata.fromColumn || '',
      );
      result.toColumn = String(metadata.toColumnName || metadata.toColumn || '');
      break;

    case 'KANBAN_MOVED':
      result.fromColumn = String(
        metadata.fromColumnName || metadata.fromColumn || '',
      );
      result.toColumn = String(metadata.toColumnName || metadata.toColumn || '');
      break;

    case 'SHARE_INVITE_CREATED':
    case 'SHARE_INVITE_EXPIRED':
      result.email = String(metadata.email || '');
      break;

    case 'INVITATION_SENT':
      result.email = String(metadata.email || '');
      break;

    case 'PROGRESS_UPDATED':
      result.oldValue = typeof metadata.oldValue === 'number' ? metadata.oldValue : 0;
      result.newValue = typeof metadata.newValue === 'number' ? metadata.newValue : 0;
      break;

    case 'PRIORITY_UPDATED':
      result.oldValue = String(metadata.oldValue || 'NONE');
      result.newValue = String(metadata.newValue || 'NONE');
      break;

    case 'EFFORT_UPDATED':
      result.oldValue = metadata.oldValue ? String(metadata.oldValue) : '(non défini)';
      result.newValue = metadata.newValue ? String(metadata.newValue) : '(non défini)';
      break;

    case 'DUE_DATE_UPDATED':
      // Format dates if present
      result.oldValue = metadata.oldValue 
        ? new Date(metadata.oldValue as string).toLocaleDateString('fr-FR')
        : '(aucune)';
      result.newValue = metadata.newValue 
        ? new Date(metadata.newValue as string).toLocaleDateString('fr-FR')
        : '(aucune)';
      break;

    // Autres types utilisent les métadonnées par défaut
    default:
      break;
  }

  return result;
}

/**
 * Formate un log d'activité en message lisible avec i18n
 */
export function formatActivityMessage(
  log: ActivityLog, 
  t: TranslationFunction,
  tBoard?: TranslationFunction
): string {
  const key = `types.${log.type}`;
  const metadata = extractMetadata(log);
  
  // Traduire les valeurs priority si disponibles
  if (log.type === 'PRIORITY_UPDATED' && tBoard && metadata.oldValue && metadata.newValue) {
    metadata.oldValue = tBoard(`priority.labels.${metadata.oldValue}`);
    metadata.newValue = tBoard(`priority.labels.${metadata.newValue}`);
  }
  
  // Traduire les valeurs effort si disponibles
  if (log.type === 'EFFORT_UPDATED' && tBoard && metadata.oldValue && metadata.newValue) {
    // Si c'est "(non défini)", on garde tel quel
    if (metadata.oldValue !== '(non défini)') {
      metadata.oldValue = tBoard(`uiSettings.effort.options.${metadata.oldValue}`);
    }
    if (metadata.newValue !== '(non défini)') {
      metadata.newValue = tBoard(`uiSettings.effort.options.${metadata.newValue}`);
    }
  }
  
  return t(key, {
    user: log.userDisplayName || log.userEmail,
    nodeShortId: log.nodeShortId ?? '?',
    ...metadata,
  });
}

/**
 * Groupe les logs d'activité par période (Aujourd'hui, Hier, Cette semaine, etc.)
 */
export interface ActivityGroup {
  label: string;
  logs: ActivityLog[];
}

export function groupActivitiesByPeriod(
  logs: ActivityLog[],
): ActivityGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const groups: ActivityGroup[] = [
    { label: "Aujourd'hui", logs: [] },
    { label: 'Hier', logs: [] },
    { label: 'Cette semaine', logs: [] },
    { label: 'Plus ancien', logs: [] },
  ];

  for (const log of logs) {
    const logDate = new Date(log.createdAt);

    if (logDate >= todayStart) {
      groups[0].logs.push(log);
    } else if (logDate >= yesterdayStart) {
      groups[1].logs.push(log);
    } else if (logDate >= weekStart) {
      groups[2].logs.push(log);
    } else {
      groups[3].logs.push(log);
    }
  }

  // Retourner uniquement les groupes non vides
  return groups.filter((group) => group.logs.length > 0);
}
