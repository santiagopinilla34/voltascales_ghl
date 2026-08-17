import { Mail, MessageSquare, Tag, ToggleRight } from "lucide-react";

import type { EditorAction } from "@/components/automations/editor-shape";

/**
 * How each action type is labelled and iconed.
 *
 * Its own module because the canvas, the step picker and the config panel all
 * need it, and the alternative — leaving it in whichever component happened to
 * need it first — is how three slightly different names for `notify_me` end up
 * on three screens.
 */
export const ACTION_META: Record<
  EditorAction["type"],
  { label: string; Icon: typeof Mail }
> = {
  send_sms: { label: "Send SMS", Icon: MessageSquare },
  send_email: { label: "Send email", Icon: Mail },
  add_tag: { label: "Add tag", Icon: Tag },
  set_status: { label: "Set status", Icon: ToggleRight },
  notify_me: { label: "Email me", Icon: Mail },
};
