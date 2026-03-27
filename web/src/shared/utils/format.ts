import { format, formatDistanceToNowStrict } from 'date-fns';

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return format(new Date(value), 'MMM d, yyyy HH:mm');
}

export function formatRelative(value?: string | null) {
  if (!value) return '—';
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function formatFileSize(value?: number | null) {
  if (!value && value !== 0) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = units[0];
  for (const next of units) {
    unit = next;
    size /= 1024;
    if (size < 1024) break;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${unit}`;
}
