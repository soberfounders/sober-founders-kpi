import { env } from "../../config/env.js";
import { supabase } from "../../clients/supabase.js";

export type SlackRole = "admin" | "manager" | "member" | "viewer" | "none";

export interface ChannelPolicy {
  channelId: string;
  policyLevel: "standard" | "executive" | "restricted";
  allowPosting: boolean;
  allowTaskCreation: boolean;
}

interface Cached<T> {
  value: T;
  expiresAt: number;
}

const cacheTtlMs = 60_000;
const roleCache = new Map<string, Cached<SlackRole>>();
const channelCache = new Map<string, Cached<ChannelPolicy>>();

const now = () => Date.now();

const defaultChannelPolicy = (channelId: string): ChannelPolicy => ({
  channelId,
  policyLevel: env.executiveChannels.includes(channelId) ? "executive" : "standard",
  allowPosting: false,
  allowTaskCreation: false,
});

export const getUserRole = async (slackUserId: string): Promise<SlackRole> => {
  const cached = roleCache.get(slackUserId);
  if (cached && cached.expiresAt > now()) return cached.value;

  const { data, error } = await supabase
    .from("slack_user_roles")
    .select("role")
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load slack user role: ${error.message}`);
  }

  const role = (data?.role ? String(data.role).toLowerCase() : "none") as SlackRole;
  const normalized: SlackRole = ["admin", "manager", "member", "viewer"].includes(role) ? role : "none";
  roleCache.set(slackUserId, { value: normalized, expiresAt: now() + cacheTtlMs });
  return normalized;
};

export const getChannelPolicy = async (channelId: string): Promise<ChannelPolicy> => {
  const cached = channelCache.get(channelId);
  if (cached && cached.expiresAt > now()) return cached.value;

  const { data, error } = await supabase
    .from("slack_channel_policies")
    .select("channel_id,policy_level,allow_posting,allow_task_creation")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load channel policy: ${error.message}`);
  }

  const policy: ChannelPolicy = data
    ? {
      channelId: String(data.channel_id),
      policyLevel: (String(data.policy_level || "standard") as ChannelPolicy["policyLevel"]),
      allowPosting: Boolean(data.allow_posting),
      allowTaskCreation: Boolean(data.allow_task_creation),
    }
    : defaultChannelPolicy(channelId);

  channelCache.set(channelId, { value: policy, expiresAt: now() + cacheTtlMs });
  return policy;
};

export const isExecutiveChannel = async (channelId: string): Promise<boolean> => {
  if (env.executiveChannels.includes(channelId)) return true;
  const policy = await getChannelPolicy(channelId);
  return policy.policyLevel === "executive";
};

export const canCreateTask = async (slackUserId: string, channelId: string): Promise<boolean> => {
  const [role, policy] = await Promise.all([getUserRole(slackUserId), getChannelPolicy(channelId)]);
  if (!["admin", "manager", "member"].includes(role)) return false;
  return policy.allowTaskCreation;
};

export const canCreateFollowup = async (slackUserId: string): Promise<boolean> => {
  const role = await getUserRole(slackUserId);
  return ["admin", "manager", "member"].includes(role);
};

export const canPostToChannel = async (slackUserId: string, channelId: string): Promise<boolean> => {
  const [role, policy] = await Promise.all([getUserRole(slackUserId), getChannelPolicy(channelId)]);
  if (role === "none" || role === "viewer") return false;
  if (!policy.allowPosting) return false;

  if (policy.policyLevel === "executive") {
    return role === "admin" || role === "manager";
  }

  if (policy.policyLevel === "restricted") {
    return role === "admin";
  }

  return true;
};

export const isHighImpactAction = async (actionType: string, channelId?: string): Promise<boolean> => {
  if (["assign_owner"].includes(actionType)) return true;
  if (actionType === "post_summary") return true;

  if (["send_slack_message", "post_summary"].includes(actionType) && channelId) {
    return isExecutiveChannel(channelId);
  }

  return false;
};
