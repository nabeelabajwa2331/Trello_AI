import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Drag sensors for the boards.
 *
 * Mouse and touch use separate sensors on purpose. A single pointer sensor can't tell a finger
 * that wants to scroll from one that wants to drag, so on phones the browser started scrolling
 * and cancelled the drag. Now:
 *   - mouse: drag starts after moving 5px
 *   - touch: press and hold ~0.2s to pick a card up; a quick swipe still scrolls the board
 *   - keyboard: Space to pick up, arrows to move, Space to drop
 */
export function useBoardSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/**
 * Auto-scroll while dragging near an edge. Gentler than the default, which on a phone flew past
 * the next list before you could let go: starts only in the outer 12% and moves at a third of the speed.
 */
export const AUTO_SCROLL = { threshold: { x: 0.12, y: 0.15 }, acceleration: 4 } as const;

/** A tiny buzz when a card is picked up by touch, on phones that support it. */
export function hapticPickUp(event: Event | null | undefined) {
  if (event && 'touches' in event) navigator.vibrate?.(12);
}
