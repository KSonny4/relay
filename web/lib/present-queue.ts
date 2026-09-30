import type { PresentedTakeAction } from "./present-mode";

type PresentedHandler = (command: PresentedTakeAction) => void;

let pendingStart = false;
let handler: PresentedHandler | null = null;

export function retainPresentedStart(): void {
  pendingStart = true;
}

export function consumePresentedStart(): boolean {
  const pending = pendingStart;
  pendingStart = false;
  return pending;
}

export function setPresentedHandler(next: PresentedHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** Deliver a deck command to the open take, or remember a start until that page mounts. */
export function deliverPresentedCommand(command: PresentedTakeAction): void {
  if (handler) handler(command);
  else if (command === "start") pendingStart = true;
}
