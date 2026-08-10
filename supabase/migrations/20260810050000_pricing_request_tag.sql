-- Finish the INFO → PRICING rename started in 20260810040000.
--
-- That migration repointed the keyword but left the rule's add_tag action
-- writing "info-request", so a PRICING match tagged contacts with the name of
-- a keyword that no longer exists. This renames the action and the one tag it
-- already applied, leaving no "info-request" anywhere.
--
-- Safe to rewrite the historical tag because this rule's add_tag is its only
-- source: no other automation writes it, and it isn't a tag anyone typed by
-- hand. Editing 20260810030000 alone would only fix databases built from
-- scratch, since that migration is already applied.

-- 1. The rule's action.
--
-- Rebuilt element-by-element rather than by position, so the action keeps its
-- place in the ordered array no matter where it sits, and any other action is
-- passed through untouched.
update public.automations
   set actions = (
     select jsonb_agg(
              case
                when element->>'type' = 'add_tag'
                 and element->>'tag' = 'info-request'
                then jsonb_set(element, '{tag}', '"pricing-request"')
                else element
              end
              order by ordinality
            )
       from jsonb_array_elements(actions) with ordinality as t(element, ordinality)
   )
 where id = '00000000-0000-4000-8000-000000000002'
   -- Guarded so a hand-edited rule is left alone.
   and actions @> '[{"type": "add_tag", "tag": "info-request"}]'::jsonb;

-- 2. The tag already on contacts.
--
-- The CASE guards the case where a contact somehow carries both tags, where a
-- plain array_replace would leave "pricing-request" in there twice.
update public.contacts
   set tags = case
                when 'pricing-request' = any (tags)
                  then array_remove(tags, 'info-request')
                else array_replace(tags, 'info-request', 'pricing-request')
              end
 where 'info-request' = any (tags);
