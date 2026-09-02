-- Where replies to app-sent email go.
--
-- ## The gap this closes
--
-- `20260816000000_sending_domain.sql` gave the app a verified domain to send
-- *from*. It did not give anyone a way to reply. Sending domains are created
-- with `capabilities.receiving = 'disabled'` (see `createDomain` in
-- `src/lib/resend/domains.ts`), and the recommended setup is a subdomain like
-- `mail.example.com` that exists only to send. So a client who hits Reply on a
-- booking confirmation is writing to a domain with no inbox: the message
-- bounces, or vanishes. The business never learns the client answered.
--
-- A Reply-To header fixes it without any of the machinery an inbox would need.
-- It is not authenticated and does not have to be — SPF, DKIM and DMARC all
-- evaluate the From domain — so it can point at any mailbox the business
-- already reads: Google Workspace, Outlook, even a personal address.
--
-- ## Why a column rather than reusing business_email
--
-- `business_email` is already the right default and is what this falls back to
-- when the column is null, so most deployments never set it. It exists for the
-- case where the two genuinely differ: `business_email` is printed on invoices
-- and receives the app's own operational alerts, while this is handed to
-- clients on every outbound message. A business that wants its automated mail
-- answered at `contact@` while its billing stays at `admin@` cannot say so
-- with one field.
--
-- Null means "use business_email", which is different from empty. There is no
-- way to express "send no Reply-To at all" and that is deliberate: the header
-- being absent is the bug this column exists to fix.

alter table public.settings
  add column if not exists sending_reply_to text;

comment on column public.settings.sending_reply_to is
  'Reply-To for outbound email. Null falls back to business_email. Needs no DNS or verification.';
