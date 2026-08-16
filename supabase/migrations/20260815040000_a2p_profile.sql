-- Draft A2P 10DLC business profile.
--
-- Nothing here is submitted to Twilio yet, and this table does not try to
-- model A2P. It holds the answers to the identity questions so they survive
-- closing the dialog — a form that loses an EIN the first time you tab away is
-- worse than no form, because you fill it once, lose it, and stop trusting it.
--
-- The columns are deliberately the prefill parameters of Twilio's
-- `trusthub.v1.complianceRegistrationInquiries`, which is the API this will
-- eventually POST to. That call returns an inquiry id and a session token for
-- an iframe that renders Twilio's own compliance UI, so the ~30 remaining
-- regulatory fields are never rebuilt here — only the handful worth collecting
-- up front and pre-filling.
--
-- Single row, enforced the same way `settings` does it: a boolean primary key
-- that must be true can only hold that value once, so a second insert fails on
-- the key rather than quietly creating a shadow row.

create table public.a2p_profile (
  id                          boolean primary key default true
                                constraint a2p_profile_singleton check (id),

  -- Business identity.
  business_legal_name         text,
  -- "EIN" in the US, "CBN" in Canada, and so on. Twilio calls this the
  -- registration authority and validates the number against it, which is why
  -- the two are stored as a pair rather than one free-text blob.
  business_registration_number text,
  business_registration_authority text,
  business_type               text,
  business_website_url        text,

  -- Registered address.
  address_street              text,
  address_street_secondary    text,
  address_city                text,
  address_subdivision         text,
  address_postal_code         text,
  address_country_code        text,

  -- Authorised representative. Twilio contacts this person, not the business.
  contact_first_name          text,
  contact_last_name           text,
  contact_email               text,
  contact_phone               text,

  -- Set once this is actually sent to Twilio. Null means draft, which is
  -- every row today.
  submitted_at                timestamptz,
  -- Twilio's inquiry id, once there is one. Kept so a part-finished embedded
  -- flow can be resumed rather than restarted.
  inquiry_id                  text,

  updated_at                  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
--
-- Same shape as every other table: the one authenticated account has full
-- access, `anon` has no policy and is therefore denied. GRANTs come from the
-- default privileges set in 20260809000000.

alter table public.a2p_profile enable row level security;

create policy "authenticated full access" on public.a2p_profile
  for all to authenticated using (true) with check (true);

-- Stated explicitly rather than trusted to defaults, matching 20260809000000.
revoke all on public.a2p_profile from anon;
