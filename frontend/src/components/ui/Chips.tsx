import clsx from 'clsx';
import { Check, Clock } from 'lucide-react';
import type { LabelId } from '../../types';
import { LABELS } from '../../lib/labels';
import { dueLabel, dueStatus } from '../../lib/dates';

export function LabelChip({ id, className }: { id: LabelId; className?: string }) {
  const l = LABELS[id];
  return (
    <span className={clsx('inline-flex items-center rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', l.className, className)}>
      {l.name}
    </span>
  );
}

const dueStyles = {
  none: '',
  normal: 'bg-column text-muted',
  soon: 'bg-soon text-soon-fg',
  over: 'bg-over text-over-fg',
  done: 'bg-done text-done-fg',
};

export function DueChip({ due, done, className }: { due: string | null; done: boolean; className?: string }) {
  if (!due) return null;
  const st = dueStatus(due, done);
  const label = dueLabel(due, done);
  const a11y = { over: 'Overdue', soon: 'Due soon', done: 'Completed', normal: 'Due', none: '' }[st];
  return (
    <span
      className={clsx('inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums', dueStyles[st], className)}
      title={`${a11y}: ${due}`}
    >
      {st === 'done' ? <Check size={11} strokeWidth={3} /> : <Clock size={11} />}
      {label}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{role}</span>
  );
}
