/**
 * The A2P 10DLC business profile, as the form holds it.
 *
 * Client-safe: the dialog builds this shape in the browser and the action
 * validates it on the server.
 *
 * Every field is a prefill parameter of Twilio's
 * `trusthub.v1.complianceRegistrationInquiries`. That is the whole reason the
 * list stops where it does — the remaining regulatory questions are asked by
 * Twilio's own embedded flow, which this eventually hands off to, so
 * collecting them here would be building a form to throw away.
 */

export type A2pProfile = {
  businessLegalName: string;
  businessRegistrationNumber: string;
  businessRegistrationAuthority: string;
  businessType: string;
  businessWebsiteUrl: string;

  addressStreet: string;
  addressStreetSecondary: string;
  addressCity: string;
  addressSubdivision: string;
  addressPostalCode: string;
  addressCountryCode: string;

  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
};

export const EMPTY_A2P_PROFILE: A2pProfile = {
  businessLegalName: "",
  businessRegistrationNumber: "",
  businessRegistrationAuthority: "",
  businessType: "",
  businessWebsiteUrl: "",
  addressStreet: "",
  addressStreetSecondary: "",
  addressCity: "",
  addressSubdivision: "",
  addressPostalCode: "",
  addressCountryCode: "US",
  contactFirstName: "",
  contactLastName: "",
  contactEmail: "",
  contactPhone: "",
};

/**
 * Where the business is registered, and what its number is called there.
 *
 * Twilio validates the registration number against the authority, so the two
 * travel together and the field label changes with the country. Getting this
 * pair wrong is the most common reason a brand registration is rejected.
 */
export const REGISTRATION_AUTHORITIES: {
  value: string;
  country: string;
  label: string;
  numberLabel: string;
  hint: string;
}[] = [
  {
    value: "EIN",
    country: "US",
    label: "United States — IRS EIN",
    numberLabel: "EIN",
    hint: "Nine digits, as issued by the IRS.",
  },
  {
    value: "CBN",
    country: "CA",
    label: "Canada — Business Number",
    numberLabel: "Business Number (BN)",
    hint: "The nine-digit CRA business number.",
  },
  {
    value: "CN",
    country: "GB",
    label: "United Kingdom — Company Number",
    numberLabel: "Company number",
    hint: "As issued by Companies House.",
  },
  {
    value: "ACN",
    country: "AU",
    label: "Australia — ACN",
    numberLabel: "ACN",
    hint: "Australian Company Number.",
  },
];

export const BUSINESS_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Corporation",
  "Co-operative",
  "Limited Liability Corporation",
  "Non-profit Corporation",
];

/** Which fields must be filled before this is worth sending anywhere. */
export const REQUIRED_A2P_FIELDS: (keyof A2pProfile)[] = [
  "businessLegalName",
  "businessRegistrationNumber",
  "businessRegistrationAuthority",
  "businessType",
  "addressStreet",
  "addressCity",
  "addressSubdivision",
  "addressPostalCode",
  "addressCountryCode",
  "contactFirstName",
  "contactLastName",
  "contactEmail",
];

/** Fields still empty, so the dialog can show progress rather than a verdict. */
export function missingA2pFields(profile: A2pProfile): (keyof A2pProfile)[] {
  return REQUIRED_A2P_FIELDS.filter((field) => !profile[field].trim());
}
