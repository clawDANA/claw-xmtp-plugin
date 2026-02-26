import type { Agent } from "@xmtp/agent-sdk";
import { monitorXmtp } from "./monitor.js";

// Global agent store for outbound (proactive) sends
const agents = new Map<string, Agent>();

export function registerAgent(accountId: string, agent: Agent) {
  agents.set(accountId, agent);
}

export function unregisterAgent(accountId: string) {
  agents.delete(accountId);
}

function getAgent(accountId?: string): Agent | undefined {
  if (accountId) return agents.get(accountId);
  return agents.values().next().value;
}

export const xmtpPlugin = {
  id: "xmtp",
  meta: {
    id: "xmtp",
    label: "XMTP",
    selectionLabel: "XMTP (Decentralized Messaging)",
    docsPath: "/channels/xmtp",
    blurb: "End-to-end encrypted decentralized messaging via XMTP protocol.",
    aliases: ["xmtp"],
  },
  capabilities: { chatTypes: ["direct"] },

  config: {
    listAccountIds: (cfg: any) =>
      Object.keys(cfg.channels?.xmtp?.accounts ?? {}),
    resolveAccount: (cfg: any, accountId: string) =>
      cfg.channels?.xmtp?.accounts?.[accountId ?? "default"] ?? { accountId },
  },

  gateway: {
    startAccount: async (ctx: any) => {
      const account = ctx.account;
      const log = ctx.log ?? console;

      return monitorXmtp({
        account,
        config: ctx.cfg,
        log,
        abortSignal: ctx.abortSignal,
      });
    },
  },

  outbound: {
    deliveryMode: "direct",
    sendText: async (params: any) => {
      const { to, text, accountId } = params;
      const agent = getAgent(accountId);

      if (!agent) {
        return { ok: false, error: "xmtp_agent_not_ready" };
      }

      try {
        const dm = await agent.createDmWithAddress(to as `0x${string}`);
        await dm.sendText(text);
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err.message ?? "xmtp_send_failed" };
      }
    },
  },
};
