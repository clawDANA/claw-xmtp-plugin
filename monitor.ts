import { Agent, createUser, createSigner, filter } from "@xmtp/agent-sdk";
import { registerAgent, unregisterAgent } from "./channel.js";
import { getRuntime } from "./runtime.js";

export async function monitorXmtp(params: {
  account: any;
  config: any;
  log: any;
  abortSignal?: AbortSignal;
}) {
  const { account, config, abortSignal } = params;
  const log = params.log ?? console;
  const accountId = account.accountId;

  // ── DEBUG: dump everything we received from OpenClaw ──
  log.info?.(`[xmtp:${accountId}] ── STARTUP DEBUG ──`);
  log.info?.(`[xmtp:${accountId}] account keys: ${JSON.stringify(Object.keys(account))}`);
  log.info?.(`[xmtp:${accountId}] accountId=${accountId}`);
  log.info?.(`[xmtp:${accountId}] env=${account.env ?? "(default: production)"}`);
  log.info?.(`[xmtp:${accountId}] dbPath config=${account.dbPath ?? "(none)"}`);
  log.info?.(`[xmtp:${accountId}] walletKey present=${!!account.walletKey} (len=${account.walletKey?.length})`);
  log.info?.(`[xmtp:${accountId}] dbEncryptionKey present=${!!account.dbEncryptionKey} (len=${account.dbEncryptionKey?.length})`);
  log.info?.(`[xmtp:${accountId}] enabled=${account.enabled}`);

  log.info?.(`[xmtp:${accountId}] Creating user from walletKey...`);
  const user = createUser(account.walletKey);
  log.info?.(`[xmtp:${accountId}] user.account.address=${user.account?.address}`);

  log.info?.(`[xmtp:${accountId}] Creating signer...`);
  const signer = createSigner(user);

  const env = account.env ?? "production";
  const dbPath = account.dbPath
    ? (inboxId: string) => {
        const p = `${account.dbPath}/${env}-${inboxId.slice(0, 8)}.db3`;
        log.info?.(`[xmtp:${accountId}] dbPath resolved: ${p}`);
        return p;
      }
    : undefined;

  const dbEncKey = account.dbEncryptionKey
    ? Buffer.from(account.dbEncryptionKey.replace(/^0x/, ""), "hex")
    : undefined;

  log.info?.(`[xmtp:${accountId}] dbEncryptionKey bytes length=${dbEncKey?.length}`);
  log.info?.(`[xmtp:${accountId}] Calling Agent.create(signer, { env=${env}, dbPath=${dbPath ? "fn" : "undefined"}, dbEncryptionKey=${dbEncKey ? "32bytes" : "undefined"} })...`);

  const agent = await Agent.create(signer, {
    env: env as any,
    dbPath,
    dbEncryptionKey: dbEncKey,
    appVersion: "openclaw-xmtp/0.1.0",
  });

  log.info?.(`[xmtp:${accountId}] Agent.create() done`);
  log.info?.(`[xmtp:${accountId}] agent.address=${agent.address}`);
  log.info?.(`[xmtp:${accountId}] agent.client.inboxId=${agent.client?.inboxId}`);
  log.info?.(`[xmtp:${accountId}] agent.client.installationId=${agent.client?.installationId}`);

  // NOTE: registerAgent is called inside the 'start' event handler below,
  // only after XMTP confirms the agent is fully online and registered.

  agent.on("text", async (ctx: any) => {
    // Ignore our own messages
    if (filter.fromSelf(ctx.message, agent.client)) return;

    const senderAddress = await ctx.getSenderAddress().catch(() => null);
    const from = senderAddress ?? ctx.message.senderInboxId;
    const text: string = String(ctx.message.content);
    const convId = ctx.conversation.id;

    log.info?.(`[xmtp:${accountId}] in from=${from} convId=${convId} text="${text.slice(0, 80)}"`);

    try {
      const rt = getRuntime();

      const ctxPayload = rt.channel.reply.finalizeInboundContext({
        Body: text,
        RawBody: text,
        From: from,
        To: agent.address,
        SessionKey: `xmtp:${accountId}:${from}`,
        AccountId: accountId,
        ChatType: "direct",
        ConversationLabel: from,
        SenderName: from,
        SenderId: from,
        Provider: "xmtp",
        Surface: "xmtp",
        OriginatingChannel: "xmtp",
        OriginatingTo: agent.address,
      });

      await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg: config,
        dispatcherOptions: {
          deliver: async (payload: any) => {
            const replyText: string = payload.text ?? "";
            if (!replyText) return;
            try {
              const dm = await agent.createDmWithAddress(from as `0x${string}`);
              await dm.sendText(replyText);
              log.info?.(`[xmtp:${accountId}] out to=${from} text="${replyText.slice(0, 80)}"`);
            } catch (err: any) {
              log.error?.(`[xmtp:${accountId}] deliver error: ${err.message ?? err}`);
            }
          },
          onError: (err: any) => {
            log.error?.(`[xmtp:${accountId}] dispatch error: ${err.message ?? err}`);
          },
        },
      });
    } catch (err: any) {
      log.error?.(`[xmtp:${accountId}] message handler error: ${err.message ?? err}`);
    }
  });

  agent.on("unhandledError", (err: any) => {
    log.error?.(`[xmtp:${accountId}] unhandled error: ${err}`);
  });

  const ready = new Promise<void>((resolve, reject) => {
    agent.on("start", () => {
      log.info?.(`[xmtp:${accountId}] ✅ 'start' event fired | address=${agent.address}`);
      registerAgent(accountId, agent);
      resolve();
    });
    agent.on("unhandledError", (err: any) => reject(err));
  });

  log.info?.(`[xmtp:${accountId}] Calling agent.start() (fire-and-forget)...`);

  // Fire-and-forget — runs the XMTP streaming loop in background
  void agent.start().catch((err: any) => {
    log.error?.(`[xmtp:${accountId}] agent.start() crashed: ${err?.message ?? err}`);
    log.error?.(`[xmtp:${accountId}] stack: ${err?.stack}`);
  });

  log.info?.(`[xmtp:${accountId}] Waiting for 'start' event...`);

  // Wait until XMTP confirms the agent is online
  await ready;

  log.info?.(`[xmtp:${accountId}] ── STARTUP COMPLETE ──`);

  const stop = async () => {
    log.info?.(`[xmtp:${accountId}] stopping`);
    await agent.stop().catch(() => { });
    unregisterAgent(accountId);
  };

  // Keep promise pending until abortSignal fires (OpenClaw requirement)
  await new Promise<void>((resolve) => {
    const onAbort = () => { void stop().then(resolve); };
    if (abortSignal) {
      if (abortSignal.aborted) { onAbort(); return; }
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }
    agent.on("stop", resolve);
  });

  return { stop };
}
