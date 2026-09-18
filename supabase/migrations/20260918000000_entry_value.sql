-- What a deal on the board is worth.
--
-- ## What was here before
--
-- Nothing, in this table. The board has shown a figure under every stage name
-- since 20260904, and it was computed in `lib/pipeline.ts`: the sum of every
-- invoice ever raised against the contacts standing in that column.
--
-- That number is backwards-looking, and the board is not. An invoice exists at
-- or after the close, so Interested, Booked and Attended were structurally
-- zero — the columns where "what is sitting here worth" is the whole question
-- were the columns that could never answer it. It also travelled with the
-- card, so the columns did not add up to anything: the same invoice total
-- moved from one to the next as the contact did.
--
-- So the value becomes what every other CRM means by it — a number someone
-- types for this deal, on this board, editable on the card. The column total
-- is the sum of its cards, which is now a real sum of real per-deal figures.
--
-- ## Cents, and an integer
--
-- Matching `invoices.total_cents`, which is the other money column in this
-- schema. Money in a float is the classic way to lose a penny per row, and a
-- numeric would be precision this does not need: nobody is invoicing fractions
-- of a cent. `integer` tops out around $21M for one deal, which is not a
-- ceiling this app's clients will find.

alter table public.pipeline_entries
  add column value_cents integer not null default 0
    constraint pipeline_entries_value_not_negative
    check (value_cents >= 0);

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
--
-- The derived figure becomes the starting value, so nobody's board goes to
-- zero on deploy: a card that reads $1,500 today because that contact was
-- invoiced $1,500 still reads $1,500 tomorrow. The difference is that the
-- number is now the entry's own and can be corrected, rather than being a
-- reading of the invoices table that no one could change from the board.
--
-- A contact invoiced nothing keeps the column default of 0, which is the same
-- zero the board shows them today.

update public.pipeline_entries entry
   set value_cents = totals.total
  from (
    select contact_id,
           sum(total_cents)::integer as total
      from public.invoices
     where contact_id is not null
     group by contact_id
  ) as totals
 where totals.contact_id = entry.contact_id
   and totals.total > 0;

comment on column public.pipeline_entries.value_cents is
  'What this deal is worth, in cents. Typed on the card; the column total is the sum of its cards.';
