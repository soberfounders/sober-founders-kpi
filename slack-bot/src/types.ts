export type IntentType =
  | "informational"
  | "recommendation"
  | "action_task_creation"
  | "outbound_posting"
  | "agent_execute";

export interface SourceAttribution {
  metric: string;
  window: string;
  confidence?: number;
}

export interface SlackResponseEnvelope {
  text: string;
  blocks?: Array<Record<string, unknown>>;
  confidence: number;
  sources: SourceAttribution[];
  timeWindow: string;
  intentType: IntentType;
  requiresConfirmation?: boolean;
  pendingActionId?: string;
}

export interface SlackActorContext {
  userId: string;
  channelId: string;
  teamId?: string;
  threadTs?: string;
  messageTs?: string;
}

export interface ToolExecutionContext {
  actor: SlackActorContext;
  traceId: string;
}

export interface DateRangeInput {
  from?: string;
  to?: string;
  label?: string;
}

export interface OrgContext {
  dashboardUrl: string;
  timezone: string;
  executiveChannels: string[];
  capabilities: string[];
}

export interface AuditPayload {
  actionType: string;
  actorUserId: string;
  channelId: string;
  intentType: IntentType;
  toolName?: string;
  status: "pending_confirmation" | "approved" | "denied" | "executed" | "failed";
  confirmationRequired: boolean;
  confirmationStatus: "pending" | "approved" | "denied" | "not_required";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  traceId: string;
}

export interface PendingConfirmation {
  id: string;
  actorUserId: string;
  channelId: string;
  threadTs?: string;
  actionType: string;
  toolName: string;
  input: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
  traceId: string;
}
