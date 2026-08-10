import { MessagesSquare } from "lucide-react";

/**
 * Shown on wide screens when no conversation is selected. On narrow screens the
 * layout hides this pane entirely and shows the list instead.
 */
export default function InboxPlaceholderPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        <MessagesSquare className="size-5" />
      </div>
      <p className="text-sm font-medium">Select a conversation</p>
      <p className="text-muted-foreground max-w-xs text-sm">
        Pick someone on the left to read the thread and reply.
      </p>
    </div>
  );
}
