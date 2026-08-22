import {
  BellRing,
  Bot,
  CircleMinus,
  Kanban,
  Mail,
  MessageSquare,
  Tag,
  ToggleRight,
  Trash2,
  UserPen,
  Webhook,
} from "lucide-react";

import type { EditorAction } from "@/components/automations/editor-shape";

/**
 * How each action type is labelled and iconed.
 *
 * Its own module because the canvas, the step picker and the config panel all
 * need it, and the alternative — leaving it in whichever component happened to
 * need it first — is how three slightly different names for `notify_me` end up
 * on three screens.
 *
 * The labels are GoHighLevel's where GoHighLevel has one for the same idea, so
 * somebody arriving from there recognises the step. They are not GHL's where
 * the idea differs: "Create/update opportunity" is a pipeline card here, and
 * calling it a deal would be borrowing a word this app never uses.
 */
export const ACTION_META: Record<
  EditorAction["type"],
  { label: string; Icon: typeof Mail }
> = {
  send_sms: { label: "Send SMS", Icon: MessageSquare },
  send_email: { label: "Send email", Icon: Mail },
  add_tag: { label: "Add contact tag", Icon: Tag },
  remove_tag: { label: "Remove contact tag", Icon: CircleMinus },
  set_status: { label: "Update contact status", Icon: ToggleRight },
  set_ai: { label: "Turn AI replies on or off", Icon: Bot },
  update_field: { label: "Update contact field", Icon: UserPen },
  set_pipeline_stage: { label: "Create/update opportunity", Icon: Kanban },
  remove_from_pipeline: { label: "Remove opportunity", Icon: Trash2 },
  notify_me: { label: "Send internal notification", Icon: BellRing },
  webhook: { label: "Custom webhook", Icon: Webhook },
};
