import clsx from 'clsx';
import { useStore } from '../../store/useStore';
import { initials } from '../../lib/id';

const sizes = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };

export function Avatar({ userId, size = 'sm', ring, className }: { userId: string; size?: keyof typeof sizes; ring?: boolean; className?: string }) {
  const user = useStore((s) => s.users[userId]);
  if (!user) return null;
  const isMe = userId === 'me';
  return (
    <span
      title={user.name}
      className={clsx(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold',
        isMe ? 'bg-ink text-surface' : 'text-white',
        ring && 'ring-2 ring-surface',
        sizes[size],
        className,
      )}
      style={isMe ? undefined : { background: user.color }}
    >
      {initials(user.name)}
    </span>
  );
}

export function AvatarStack({ ids, max = 4, size = 'sm' }: { ids: string[]; max?: number; size?: keyof typeof sizes }) {
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((id) => (
        <Avatar key={id} userId={id} size={size} ring />
      ))}
      {extra > 0 && (
        <span className={clsx('inline-grid place-items-center rounded-full bg-column font-semibold text-muted ring-2 ring-surface', sizes[size])}>
          +{extra}
        </span>
      )}
    </span>
  );
}
