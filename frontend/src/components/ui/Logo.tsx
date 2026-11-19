import { Link } from 'react-router-dom';
import clsx from 'clsx';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx('h-7 w-7 shrink-0', className)} aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <rect x="7" y="7" width="4.5" height="18" rx="1" className="fill-accent" />
      <rect x="13.75" y="7" width="4.5" height="11" rx="1" className="fill-accent" />
      <rect x="20.5" y="7" width="4.5" height="14" rx="1" className="fill-accent" />
    </svg>
  );
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="font-wide flex items-center gap-2 rounded-md font-display text-lg font-extrabold tracking-tight">
      <LogoMark />
      Crewboard
    </Link>
  );
}
