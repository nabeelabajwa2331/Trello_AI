const EMOJI = ['🎉', '✨', '⭐', '🎊', '🙌', '✨'];

/** A small emoji burst over a card, e.g. when it lands in a Done list. */
export function celebrateCard(cardId: string) {
  // Wait for the card to render in its new list.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2);
    }),
  );
}

function burst(x: number, y: number) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  EMOJI.forEach((e, i) => {
    const s = document.createElement('span');
    s.textContent = e;
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:70;font-size:22px;pointer-events:none;translate:-50% -50%;`;
    document.body.appendChild(s);
    const angle = (Math.PI * 2 * i) / EMOJI.length - Math.PI / 2;
    const dist = 46 + (i % 2) * 18;
    const a = s.animate(
      [
        { transform: 'translate(0,0) scale(.4)', opacity: 0 },
        { transform: `translate(${Math.cos(angle) * dist * 0.7}px,${Math.sin(angle) * dist * 0.7}px) scale(1.1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist - 10}px) scale(.9)`, opacity: 0 },
      ],
      { duration: reduce ? 1 : 900, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
    a.onfinish = () => s.remove();
  });
}
