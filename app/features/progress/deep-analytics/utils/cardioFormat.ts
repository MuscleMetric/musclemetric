export function positiveNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function cardioDistance(value: number | string | null | undefined): string {
  const number = positiveNumber(value);
  return number == null ? '—' : `${Number(number.toFixed(2))} km`;
}

export function cardioTime(value: number | string | null | undefined): string {
  const number = positiveNumber(value);
  if (number == null) return '—';
  const seconds = Math.round(number);
  const minutes = Math.floor(seconds / 60);
  const tail = String(seconds % 60).padStart(2, '0');
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`
    : `${minutes}:${tail}`;
}

export function cardioPace(value: number | string | null | undefined): string {
  const number = positiveNumber(value);
  if (number == null) return '—';
  const seconds = Math.round(number);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} /km`;
}
