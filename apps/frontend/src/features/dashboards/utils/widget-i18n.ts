import type { DashboardWidgetEntry } from '@/features/dashboards/dashboards-api';

export type TranslateFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

type WidgetField = 'label' | 'description';

type TranslationKey = `dashboard.widgets.${string}.${WidgetField}`;

function buildKey(widgetId: DashboardWidgetEntry['id'], field: WidgetField): TranslationKey {
  const normalized = widgetId.replace(/\./g, '-');
  return `dashboard.widgets.${normalized}.${field}` as TranslationKey;
}

export function localizeWidgetField(
  t: TranslateFn,
  widget: Pick<DashboardWidgetEntry, 'id'>,
  field: WidgetField,
  fallback: string,
): string {
  const key = buildKey(widget.id, field);
  const translated = t(key);
  return translated === key ? fallback : translated;
}
