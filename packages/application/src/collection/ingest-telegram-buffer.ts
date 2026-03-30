import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";
import { loadRepoEnv } from "../config/load-env.js";

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramMessage = {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  from?: {
    id: number;
    username?: string;
    first_name?: string;
  };
  chat: {
    id: number;
    title?: string;
    username?: string;
  };
};

type TelegramUpdatesResponse = {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
};

type TelegramIngestionResult = {
  enabled: boolean;
  updatesFetched: number;
  messagesSeen: number;
  messagesBuffered: number;
  warnings: string[];
};

const nowIso = () => new Date().toISOString();

const normalizeText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .trim();

const readText = (message: TelegramMessage): string => normalizeText(message.text ?? message.caption ?? "");

const fetchTelegramUpdates = async (token: string, offset?: number): Promise<TelegramUpdatesResponse> => {
  const query = new URLSearchParams({ limit: "100" });
  if (typeof offset === "number" && Number.isFinite(offset)) {
    query.set("offset", String(offset));
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?${query.toString()}`);
  return (await response.json()) as TelegramUpdatesResponse;
};

const insertTelegramMessagesIntoBuffer = async (db: AppDbClient, messages: TelegramMessage[]) => {
  const now = nowIso();
  let inserted = 0;

  for (const message of messages) {
    const text = readText(message);
    if (!text) continue;

    const rows = await db.query<{ id: string }>(
      `INSERT INTO community_message_buffer (
        id, platform, external_chat_id, external_message_id, chat_title, author_id, author_label, text_content, sent_at, raw_payload, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (platform, external_chat_id, external_message_id) DO NOTHING
      RETURNING id`,
      [
        randomUUID(),
        "telegram",
        String(message.chat.id),
        String(message.message_id),
        message.chat.title ?? message.chat.username ?? null,
        message.from?.id ? String(message.from.id) : null,
        message.from?.username ?? message.from?.first_name ?? String(message.from?.id ?? "unknown"),
        text,
        new Date(message.date * 1000).toISOString(),
        JSON.stringify(message),
        now
      ]
    );
    if (rows.length > 0) {
      inserted += 1;
    }
  }

  return inserted;
};

export const ingestTelegramBuffer = async (db: AppDbClient, repoRoot: string): Promise<TelegramIngestionResult> => {
  const env = loadRepoEnv(repoRoot);
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const warnings: string[] = [];

  if (!token) {
    return {
      enabled: false,
      updatesFetched: 0,
      messagesSeen: 0,
      messagesBuffered: 0,
      warnings: ["TELEGRAM_BOT_TOKEN is not configured."]
    };
  }

  const updatesPayload = await fetchTelegramUpdates(token);
  if (!updatesPayload.ok || !Array.isArray(updatesPayload.result)) {
    return {
      enabled: true,
      updatesFetched: 0,
      messagesSeen: 0,
      messagesBuffered: 0,
      warnings: [`Telegram getUpdates failed: ${updatesPayload.description ?? "unknown_error"}`]
    };
  }

  const updates = updatesPayload.result;
  const maxUpdateId = updates.reduce((max, item) => Math.max(max, item.update_id), 0);
  const updateMessages = updates
    .map((item) => item.message ?? item.edited_message ?? null)
    .filter((message): message is TelegramMessage => Boolean(message));
  const messagesBuffered = await insertTelegramMessagesIntoBuffer(db, updateMessages);

  if (maxUpdateId > 0) {
    try {
      await fetchTelegramUpdates(token, maxUpdateId + 1);
    } catch (error) {
      warnings.push(`Telegram offset ack failed: ${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }

  return {
    enabled: true,
    updatesFetched: updates.length,
    messagesSeen: updateMessages.length,
    messagesBuffered,
    warnings
  };
};

