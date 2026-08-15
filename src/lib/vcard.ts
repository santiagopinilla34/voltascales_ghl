/**
 * vCard parsing, for importing contacts from a phone or a desktop address book.
 *
 * Deliberately narrow. A vCard can carry photos, addresses, birthdays, social
 * profiles, anniversaries and arbitrary vendor extensions; this CRM stores a
 * name, a phone, an email and a business name, so those four are all that is
 * read and everything else is dropped on the floor. Importing fields with
 * nowhere to go would mean either inventing columns or silently losing data
 * later, and dropping them here is the honest version of both.
 *
 * Handles what real exports actually contain:
 *
 * - vCard 2.1, 3.0 and 4.0 in one file (iOS, Android and Outlook all differ)
 * - folded lines, which is how a long DKIM-length value arrives
 * - `ENCODING=QUOTED-PRINTABLE`, which Android still emits for accented names
 * - grouped properties (`item1.TEL:…`), which is how iOS labels numbers
 * - the `\,` `\;` `\n` escapes inside values
 *
 * Client-safe and dependency-free: the file never leaves the browser until the
 * operator has seen what is in it and pressed import.
 */

import { normalizePhone } from "@/lib/phone/normalize";

/** Exactly the fields the contact form has. */
export type ParsedContact = {
  /** Stable within one parse, for React keys and selection. */
  id: string;
  name: string;
  /**
   * E.164, and never null: a card whose number could not be normalised is
   * counted as skipped rather than returned, because `contacts.phone` is the
   * table's natural key and a row without one cannot exist.
   */
  phone: string;
  /** What the card actually said, for showing beside the normalised number. */
  rawPhone: string;
  email: string | null;
  businessName: string | null;
};

export type ParseResult = {
  contacts: ParsedContact[];
  /** Cards that had no usable phone number at all, counted for the summary. */
  skipped: number;
};

type Property = {
  name: string;
  params: Map<string, string[]>;
  value: string;
};

/**
 * Undoes RFC 6350 line folding.
 *
 * A continuation line begins with a space or a tab, and that one character is
 * the marker rather than part of the value. Handles CRLF, LF and the bare CR
 * that some very old exporters still produce.
 */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];

  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }

  return out;
}

/**
 * Splits `GROUP.NAME;PARAM=A,B;PARAM2:value` into its three parts.
 *
 * The colon that ends the parameters is not simply the first one in the line:
 * a parameter value may be quoted and contain a colon of its own, which is how
 * `TYPE="work,voice"` and URI-valued parameters arrive. So the scan tracks
 * quoting.
 */
function parseProperty(line: string): Property | null {
  let colon = -1;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === ":" && !quoted) {
      colon = index;
      break;
    }
  }

  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = splitUnquoted(head, ";");

  // `item1.TEL` — the group prefix is a label grouping and means nothing here.
  const rawName = segments[0] ?? "";
  const name = rawName.slice(rawName.lastIndexOf(".") + 1).toUpperCase();
  if (!name) return null;

  const params = new Map<string, string[]>();

  for (const segment of segments.slice(1)) {
    const equals = segment.indexOf("=");

    // vCard 2.1 writes bare parameters: `TEL;CELL;VOICE:…`. They are TYPE
    // values with the key left off.
    const [key, raw] =
      equals === -1
        ? ["TYPE", segment]
        : [segment.slice(0, equals), segment.slice(equals + 1)];

    const values = splitUnquoted(raw, ",").map((entry) =>
      entry.replace(/^"|"$/g, "").trim().toUpperCase(),
    );

    const upperKey = key.trim().toUpperCase();
    params.set(upperKey, [...(params.get(upperKey) ?? []), ...values]);
  }

  return { name, params, value };
}

/** Splits on a delimiter, ignoring delimiters inside double quotes. */
function splitUnquoted(input: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of input) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  out.push(current);
  return out;
}

/**
 * Decodes `=C3=A9` style escapes.
 *
 * Decoded as UTF-8 rather than byte-by-byte: quoted-printable encodes octets,
 * and a two-byte character decoded one octet at a time comes out as mojibake —
 * which is exactly what "Bélanger" looks like when it goes wrong.
 */
function decodeQuotedPrintable(input: string, charset: string): string {
  // A trailing "=" is a soft line break. Folding has already joined the lines,
  // so the marker is all that is left to remove.
  const joined = input.replace(/=\n/g, "").replace(/=$/gm, "");

  const bytes: number[] = [];
  for (let index = 0; index < joined.length; index += 1) {
    if (joined[index] === "=" && index + 2 < joined.length) {
      const hex = joined.slice(index + 1, index + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        index += 2;
        continue;
      }
    }
    bytes.push(joined.charCodeAt(index) & 0xff);
  }

  try {
    return new TextDecoder(charset || "utf-8", { fatal: false }).decode(
      new Uint8Array(bytes),
    );
  } catch {
    // An unknown charset label is not worth failing the whole import over.
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

/** Applies the value escapes, and any encoding the parameters declared. */
function decodeValue(property: Property): string {
  const encoding = property.params.get("ENCODING")?.[0] ?? "";
  const charset = property.params.get("CHARSET")?.[0] ?? "";

  let value = property.value;

  if (encoding === "QUOTED-PRINTABLE") {
    value = decodeQuotedPrintable(value, charset);
  }

  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** The structured `N` field: family;given;middle;prefix;suffix. */
function nameFromStructured(value: string): string {
  const [family = "", given = "", middle = ""] = splitUnquoted(value, ";");
  return [given, middle, family]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Unwraps `tel:+16135550044;ext=12` to `+16135550044`.
 *
 * vCard 4.0 writes phone numbers as RFC 3966 URIs, and the scheme has to come
 * off before normalisation. Not cosmetic: `normalizePhone` reads a leading `+`
 * to mean "this already has a country code", and `tel:+44…` does not start
 * with one — so a UK number left as a URI is read as a bare 12-digit string
 * and rejected. North American numbers happen to survive it, which is exactly
 * the kind of bug that only shows up on someone else's address book.
 */
function stripTelUri(value: string): string {
  // Parameters after the number are an extension or a phone-context, neither
  // of which belongs in an E.164 string.
  return value.replace(/^tel:/i, "").split(";")[0].trim();
}

/**
 * Picks the number to import when a card has several.
 *
 * Mobile wins outright — this CRM texts people, and a landline that receives a
 * text receives nothing. After that, an explicitly preferred number, then
 * whatever came first. A card with only a fax number is not a contact this app
 * can do anything with, so fax is never chosen.
 */
function rankPhone(params: Map<string, string[]>): number {
  const types = params.get("TYPE") ?? [];

  if (types.includes("FAX")) return -1;
  if (types.includes("CELL") || types.includes("MOBILE")) return 3;
  if (types.includes("PREF") || params.has("PREF")) return 2;
  if (types.includes("WORK") || types.includes("HOME")) return 1;
  return 0;
}

/** Same idea for email: a preferred address, else the first. */
function rankEmail(params: Map<string, string[]>): number {
  const types = params.get("TYPE") ?? [];
  if (types.includes("PREF") || params.has("PREF")) return 2;
  if (types.includes("WORK")) return 1;
  return 0;
}

/**
 * Reads every card in a `.vcf` file.
 *
 * Cards with no phone number are counted rather than returned: `contacts.phone`
 * is the table's natural key and every webhook looks a person up by it, so a
 * row without one cannot exist. The count is shown so an import of 200 cards
 * that yields 140 contacts explains the other 60.
 */
export function parseVCards(text: string): ParseResult {
  const contacts: ParsedContact[] = [];
  let skipped = 0;

  /** The card being read, or null between `END:VCARD` and the next `BEGIN`. */
  type Card = {
    formatted: string;
    structured: string;
    organisation: string;
    phone: { value: string; rank: number } | null;
    email: { value: string; rank: number } | null;
  };

  let card: Card | null = null;

  for (const line of unfold(text)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const upper = trimmed.toUpperCase();

    if (upper === "BEGIN:VCARD") {
      card = {
        formatted: "",
        structured: "",
        organisation: "",
        phone: null,
        email: null,
      };
      continue;
    }

    if (upper === "END:VCARD") {
      if (card) {
        const raw = card.phone;
        const normalized = raw ? normalizePhone(raw.value) : null;

        if (raw && normalized) {
          contacts.push({
            id: `${contacts.length}-${normalized}`,
            name: card.formatted || card.structured,
            phone: normalized,
            rawPhone: raw.value,
            email: card.email?.value ?? null,
            businessName: card.organisation || null,
          });
        } else {
          skipped += 1;
        }
      }
      card = null;
      continue;
    }

    if (!card) continue;

    const property = parseProperty(trimmed);
    if (!property) continue;

    switch (property.name) {
      case "FN":
        card.formatted = decodeValue(property);
        break;

      case "N":
        // Kept as a fallback: FN is the display name and is what a person
        // would recognise, but Outlook exports sometimes omit it.
        card.structured = nameFromStructured(decodeValue(property));
        break;

      case "ORG": {
        // `ORG:Acme;Sales Division` — the first component is the company.
        const [company = ""] = splitUnquoted(decodeValue(property), ";");
        if (company.trim()) card.organisation = company.trim();
        break;
      }

      case "TEL": {
        const value = stripTelUri(decodeValue(property));
        const rank = rankPhone(property.params);
        if (!value || rank < 0) break;
        if (!card.phone || rank > card.phone.rank) card.phone = { value, rank };
        break;
      }

      case "EMAIL": {
        const value = decodeValue(property);
        const rank = rankEmail(property.params);
        if (!value) break;
        if (!card.email || rank > card.email.rank) card.email = { value, rank };
        break;
      }

      // Everything else — BDAY, ADR, PHOTO, URL, NOTE, X-* — has no column to
      // land in and is deliberately ignored.
      default:
        break;
    }
  }

  return { contacts, skipped };
}

/**
 * Drops cards that duplicate a number, within the file and against what is
 * already in the CRM.
 *
 * Phone exports routinely contain the same person twice, and the insert would
 * fail on the unique index anyway; catching it here means the preview can say
 * so before the operator presses import rather than after.
 */
export function dedupe(
  contacts: ParsedContact[],
  existingPhones: Set<string>,
): { fresh: ParsedContact[]; duplicates: ParsedContact[] } {
  const seen = new Set<string>();
  const fresh: ParsedContact[] = [];
  const duplicates: ParsedContact[] = [];

  for (const contact of contacts) {
    const phone = contact.phone;

    if (seen.has(phone) || existingPhones.has(phone)) {
      duplicates.push(contact);
    } else {
      seen.add(phone);
      fresh.push(contact);
    }
  }

  return { fresh, duplicates };
}
