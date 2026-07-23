export function formatDateLine(startsAt: string) {
  return new Date(startsAt).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeLine(startsAt: string) {
  return new Date(startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatStartsAt(startsAt: string) {
  return new Date(startsAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
}

export function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
