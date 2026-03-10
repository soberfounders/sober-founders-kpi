import crypto from "node:crypto";
import { env } from "../../config/env.js";
import type { PendingConfirmation } from "../../types.js";

const pendingActions = new Map<string, PendingConfirmation>();

const now = () => new Date();

export const createPendingConfirmation = (payload: Omit<PendingConfirmation, "id" | "createdAt" | "expiresAt">): PendingConfirmation => {
  const createdAt = now();
  const expiresAt = new Date(createdAt.getTime() + (env.confirmationTtlMinutes * 60_000));
  const pending: PendingConfirmation = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt,
    expiresAt,
  };

  pendingActions.set(pending.id, pending);
  return pending;
};

export const getPendingConfirmation = (id: string): PendingConfirmation | null => {
  purgeExpiredConfirmations();
  return pendingActions.get(id) || null;
};

export const consumePendingConfirmation = (id: string): PendingConfirmation | null => {
  purgeExpiredConfirmations();
  const pending = pendingActions.get(id) || null;
  if (pending) pendingActions.delete(id);
  return pending;
};

export const purgeExpiredConfirmations = () => {
  const currentTime = now().getTime();
  for (const [id, pending] of pendingActions.entries()) {
    if (pending.expiresAt.getTime() <= currentTime) {
      pendingActions.delete(id);
    }
  }
};

export const listPendingConfirmations = (): PendingConfirmation[] => {
  purgeExpiredConfirmations();
  return Array.from(pendingActions.values());
};
