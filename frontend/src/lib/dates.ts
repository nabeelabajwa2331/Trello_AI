import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';

type DueStatus = 'none' | 'done' | 'over' | 'soon' | 'normal';

export function dueStatus(due: string | null, done: boolean): DueStatus {
  if (!due) return 'none';
  if (done) return 'done';
  const diff = differenceInCalendarDays(parseISO(due), new Date());
  if (diff < 0) return 'over';
  if (diff <= 1) return 'soon';
  return 'normal';
}

/** Dates the way people say them: "Today", "Tomorrow", "Fri", "Nov 28", "2 days late". */
export function dueLabel(due: string, done = false): string {
  const d = parseISO(due);
  const diff = differenceInCalendarDays(d, new Date());
  if (!done && diff < -1) return `${-diff} days late`;
  if (diff === -1) return done ? 'Yesterday' : '1 day late';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return format(d, 'EEE');
  return format(d, 'MMM d');
}

export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'just now';
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
    .replace(' minutes', 'm')
    .replace(' minute', 'm')
    .replace(' hours', 'h')
    .replace(' hour', 'h');
}
