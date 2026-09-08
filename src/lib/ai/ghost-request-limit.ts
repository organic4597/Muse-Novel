type Slot = { startedAt: number; active: boolean };
const runtime = globalThis as typeof globalThis & { __museGhostSlots?: Map<string, Slot> };
const slots = runtime.__museGhostSlots ?? new Map<string, Slot>();
runtime.__museGhostSlots = slots;
export function reserveGhostRequest(projectId: string, now = Date.now()): (() => void) | null {
  const previous = slots.get(projectId);
  if (previous && (previous.active || now - previous.startedAt < 1000)) return null;
  if (slots.size > 1000) {
    for (const [id, slot] of slots) if (!slot.active && now - slot.startedAt > 60000) slots.delete(id);
  }
  const slot = { startedAt: now, active: true };
  slots.set(projectId, slot);
  return () => { slot.active = false; };
}
