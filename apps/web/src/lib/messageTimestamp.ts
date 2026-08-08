export function isSameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

/**
 * Keep today's messages compact while giving older messages an unambiguous date.
 * Calendar comparisons intentionally use the client's local timezone.
 */
export function formatMessageTimestamp(
  value: string | number | Date,
  now = new Date(),
  locale?: string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  if (isSameLocalDay(date, now)) {
    return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  }

  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatFullMessageTimestamp(value: string | number | Date, locale?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}
