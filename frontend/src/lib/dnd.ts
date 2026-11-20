import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/** Drag sensors for the boards. */
export function useBoardSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Auto-scroll while dragging near an edge. */
export const AUTO_SCROLL = { threshold: { x: 0.12, y: 0.15 }, acceleration: 4 } as const;

/** A tiny buzz when a card is picked up by touch, on phones that support it. */
export function hapticPickUp(event: Event | null | undefined) {
  if (event && 'touches' in event) navigator.vibrate?.(12);
}
