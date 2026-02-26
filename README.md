# claw-xmtp-channel-plugin

> Native XMTP channel plugin for [OpenClaw](https://github.com/openclaw/openclaw) — end-to-end encrypted decentralized messaging via the [XMTP protocol](https://xmtp.org).

## Overview

This plugin registers XMTP as a first-class channel in OpenClaw, alongside Telegram, Signal, Discord, etc. Your agent gets a wallet address on the XMTP network and can receive and send encrypted messages directly.

```
User (XMTP client)  ←→  XMTP Network  ←→  OpenClaw agent
```

## Features

- ✅ Inbound: DM → dispatched to OpenClaw session (full reply context)
- ✅ Outbound: OpenClaw → XMTP DM (proactive sends)
- ✅ E2E encrypted via XMTP protocol
- ✅ Persistent SQLite identity DB (survives restarts)
- ✅ Self-message filter
- ✅ Multiple accounts supported

## Installation

Copy (or symlink) this directory into your OpenClaw extensions folder:

```bash
cp -r claw-xmtp-channel-plugin ~/.openclaw/extensions/xmtp
cd ~/.openclaw/extensions/xmtp
npm install
```

## Configuration

Add the following to your OpenClaw config (`~/.openclaw/config.json` or equivalent):

```json
{
  "channels": {
    "xmtp": {
      "accounts": {
        "default": {
          "walletKey": "0x<your-wallet-private-key>",
          "dbEncryptionKey": "0x<64-hex-char-encryption-key>",
          "dbPath": "/home/ubuntu/.openclaw/data/xmtp",
          "env": "production",
          "enabled": true
        }
      }
    }
  }
}
```

| Field              | Required | Description                                      |
|--------------------|----------|--------------------------------------------------|
| `walletKey`        | ✅       | EVM private key (0x…) — your agent's identity   |
| `dbEncryptionKey`  | ✅       | 32-byte hex key for SQLite DB encryption         |
| `dbPath`           | optional | Directory for XMTP SQLite DB files               |
| `env`              | optional | `production` (default), `dev`, or `local`        |
| `enabled`          | optional | `true` by default                                |

> ⚠️ Keep `walletKey` and `dbEncryptionKey` secret. Never commit them.

## File Structure

```
.
├── index.ts              # Plugin entry point — registers channel with OpenClaw
├── channel.ts            # Plugin manifest + outbound sendText
├── monitor.ts            # XMTP Agent listener, inbound message dispatch
├── runtime.ts            # OpenClaw runtime bridge
├── openclaw.plugin.json  # Plugin metadata and config schema
├── package.json
└── package-lock.json
```

## How It Works

1. **Startup:** OpenClaw loads the plugin and calls `register(api)`. The plugin initializes an XMTP `Agent` using the configured wallet key.
2. **Inbound:** The agent listens for incoming DMs. Each message is dispatched into OpenClaw's session routing with full context (sender address, conversation ID, etc.).
3. **Outbound:** OpenClaw calls `sendText({ to, text })` when the agent wants to reply or send proactively. The plugin resolves (or creates) a DM conversation with the target address and sends the message.

## Supported Chat Types

| Type    | Status |
|---------|--------|
| DM      | ✅     |
| Group   | 🔜 planned |

## Dependencies

- [`@xmtp/agent-sdk`](https://www.npmjs.com/package/@xmtp/agent-sdk) ^2.2.0

## License

MIT
