export function buildDateSheetDates(startDate: string, endDate: string, subjectCount: number) {
  if (!startDate || !endDate || Number(subjectCount) <= 0) return [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const total = Math.max(1, Math.round(subjectCount));
  if (total === 1) return [startDate];

  const dayMs = end.getTime() - start.getTime();
  const spanDays = Math.max(1, Math.round(dayMs / 86_400_000));
  const step = spanDays / (total - 1);

  return Array.from({ length: total }, (_, index) => {
    const date = new Date(start.getTime() + index * step * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
}
