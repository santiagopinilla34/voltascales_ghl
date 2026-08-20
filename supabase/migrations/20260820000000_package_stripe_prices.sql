-- Payment links: remembering what a package is called over in Stripe.
--
-- ## Why anything is stored at all
--
-- Stripe's payment links do not take an amount. They take a Price, which
-- belongs to a Product, so "charge $400 for the Starter package" is three
-- objects rather than one number. Creating that pair on every link would fill a
-- client's Stripe catalog with a new identical product for each link they ever
-- send, which is their dashboard being made worse by us.
--
-- So the pair is created once per package and remembered here. The catalog in
-- Stripe then mirrors the catalog in this app, which is what someone opening
-- Stripe would expect to find.
--
-- ## Why the amount is stored next to the id
--
-- A Stripe Price is immutable. Editing a package's price in this app cannot
-- update it, and reusing the old id would produce a link that charges the old
-- amount — silently, and correctly as far as Stripe is concerned. Keeping the
-- cents the price was created for makes that detectable: they disagree, so a
-- new Price is minted and the id replaced.
--
-- The Product is kept in the same case. Only the Price is version-bumped.
--
-- ## Why these can go stale, and why that is handled elsewhere
--
-- These ids belong to whichever Stripe account was connected when they were
-- made. Connect a different account and they name nothing. Rather than store an
-- account id here and compare it on every read, disconnecting clears the
-- columns — see `disconnectStripe`. The invariant is: if these are set, they
-- belong to the currently connected account.

alter table public.packages
  add column stripe_product_id text,
  add column stripe_price_id text,

  -- The amount the stored Price was created for. Null whenever there is no
  -- price. Compared against `price_cents` to detect an edit.
  add column stripe_price_cents integer;

-- Both ids appear together or not at all. A product with no price is a dead end
-- that the next link would have to work around; a price with no product cannot
-- exist at Stripe in the first place.
alter table public.packages
  add constraint packages_stripe_pair
  check (
    (stripe_product_id is null and stripe_price_id is null and stripe_price_cents is null)
    or
    (stripe_product_id is not null and stripe_price_id is not null and stripe_price_cents is not null)
  );

comment on column public.packages.stripe_price_id is
  'Stripe Price backing payment links for this package. Cleared when the Stripe account is disconnected.';
