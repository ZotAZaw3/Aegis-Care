import { useCallback, useState } from "react";
import { getFreshToken } from "@/lib/session-token";
import { useI18n } from "@/lib/i18n";
import type { ChatMessage } from "./copilot-message";

type CopilotResponse = {
  answer?: string;
  citations?: { source: string; detail?: string }[];
  tool_calls?: { tool: string; args_summary?: string }[];
  error?: string;
};

let idCounter = 0;
const nextId = () => `m${Date.now()}-${idCounter++}`;

export function useCopilotChat(patientId?: string) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const reset = useCallback(() => setMessages([]), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = { id: nextId(), role: "user", content: trimmed };
      const history = [...messages, userMsg];
      setMessages(history);
      setLoading(true);

      const errorReply = (content: string): ChatMessage => ({
        id: nextId(),
        role: "assistant",
        content,
        error: true,
      });

      try {
        const token = await getFreshToken();
        if (!token) {
          setMessages((prev) => [...prev, errorReply(t("copilot_error_auth"))]);
          return;
        }

        const res = await fetch("/api/copilot", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            ...(patientId ? { patient_id: patientId } : {}),
          }),
        });

        if (res.status === 401) {
          setMessages((prev) => [...prev, errorReply(t("copilot_error_auth"))]);
          return;
        }

        const payload = (await res.json().catch(() => null)) as CopilotResponse | null;
        if (!res.ok || !payload || payload.error || !payload.answer) {
          setMessages((prev) => [...prev, errorReply(t("copilot_error_generic"))]);
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            content: payload.answer!,
            citations: payload.citations ?? [],
            tool_calls: payload.tool_calls ?? [],
          },
        ]);
      } catch {
        setMessages((prev) => [...prev, errorReply(t("copilot_error_generic"))]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, patientId, t],
  );

  return { messages, loading, send, reset };
}
