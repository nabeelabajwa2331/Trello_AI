import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

const EDGE = 8; // keep menus at least this far from the screen edges

/** Small dropdown anchored to a trigger. */
export function Popover({
  trigger,
  children,
  align = 'left',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Measure after opening and nudge it back inside the screen.
  useLayoutEffect(() => {
    if (!open) return setShift(0);
    const el = panel.current;
    if (!el) return;
    const vw = document.documentElement.clientWidth;
    const r = el.getBoundingClientRect();
    const left = r.left - shift;
    const right = r.right - shift;
    if (left < EDGE) setShift(EDGE - left);
    else if (right > vw - EDGE) setShift(vw - EDGE - right);
    else setShift(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          ref={panel}
          style={{ transform: shift ? `translateX(${shift}px)` : undefined, maxWidth: `calc(100vw - ${EDGE * 2}px)` }}
          className={clsx(
            'absolute top-full z-40 mt-2 rounded-[10px] border border-line bg-surface p-1.5 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            className ?? 'w-64',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  active,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-column',
        active && 'bg-column font-semibold',
        danger && 'text-danger',
      )}
    >
      {children}
    </button>
  );
}
