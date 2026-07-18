import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

export type Citation = { source: string; detail?: string };
export type ToolCall = { tool: string; args_summary?: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  tool_calls?: ToolCall[];
  error?: boolean;
};

export function CopilotMessage({ message }: { message: ChatMessage }) {
  const { t } = useI18n();
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : message.error
              ? "rounded-bl-sm border border-destructive/40 bg-destructive/10 text-destructive"
              : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((c, i) => (
              <Badge
                key={`${c.source}-${i}`}
                variant="secondary"
                className="max-w-full whitespace-normal text-left text-[11px] font-medium"
              >
                <span className="break-words">
                  {c.source}
                  {c.detail ? ` · ${c.detail}` : ""}
                </span>
              </Badge>
            ))}
          </div>
        )}

        {!isUser && message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wrench className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="break-words">
              {t("copilot_tools_used")}: {message.tool_calls.map((tc) => tc.tool).join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
