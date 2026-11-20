import { useState } from 'react';
import clsx from 'clsx';
import { useStore } from '../../store/useStore';
import { initials } from '../../lib/id';

const sizes = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };

export function Avatar({
  userId,
  size = 'sm',
  ring,
  online,
  className,
}: {
  userId: string;
  size?: keyof typeof sizes;
  ring?: boolean;
  online?: boolean;
  className?: string;
}) {
  const user = useStore((s) => s.users[userId]);
  const isMe = useStore((s) => s.me === userId);
  const [broken, setBroken] = useState(false);
  if (!user) return null;
  const title = online === undefined ? user.name : `${user.name}${online ? ' · online' : ''}`;
  const photo = user.avatarUrl && !broken;
  return (
    <span className="relative inline-flex shrink-0">
      {photo ? (
        <img
          src={user.avatarUrl!}
          alt={user.name}
          title={title}
          referrerPolicy="no-referrer" // Google photos refuse requests that send a referrer
          onError={() => setBroken(true)}
          className={clsx('rounded-full object-cover', ring && 'ring-2 ring-surface', sizes[size], className)}
        />
      ) : (
        <span
          title={title}
          className={clsx(
            'inline-grid place-items-center rounded-full font-semibold',
            isMe ? 'bg-ink text-surface' : 'text-white',
            ring && 'ring-2 ring-surface',
            sizes[size],
            className,
          )}
          style={isMe ? undefined : { background: user.color }}
        >
          {initials(user.name)}
        </span>
      )}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" aria-hidden="true" />
      )}
    </span>
  );
}

export function AvatarStack({
  ids,
  max = 4,
  size = 'sm',
  online,
}: {
  ids: string[];
  max?: number;
  size?: keyof typeof sizes;
  online?: string[];
}) {
  // Online people first, so the green dots are visible even when the stack is truncated.
  const sorted = online ? [...ids].sort((a, b) => Number(online.includes(b)) - Number(online.includes(a))) : ids;
  const shown = sorted.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((id) => (
        <Avatar key={id} userId={id} size={size} ring online={online ? online.includes(id) : undefined} />
      ))}
      {extra > 0 && (
        <span
          className={clsx(
            'inline-grid place-items-center rounded-full bg-column font-semibold text-muted ring-2 ring-surface',
            sizes[size],
          )}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
