import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";

export const slackWeb = new WebClient(env.slackBotToken);
