/**
 * Characters that quietly double the cost of a text.
 *
 * SMS is billed per segment, and a segment holds 153 characters while every
 * one of them fits GSM-7. A character that doesn't — an em dash, a curly
 * apostrophe, an accented letter, an emoji — switches the whole message to
 * UCS-2 and cuts the segment to 67. A single smart quote pasted in from a word
 * processor can take a two-segment confirmation to four, on every booking,
 * forever.
 *
 * Never blocked, because sometimes the character is the right call. Warned
 * about, because the cost is otherwise completely invisible: nothing in the
 * message looks different and the bill arrives a month later.
 *
 * Client-safe.
 */
const GSM7 =
  /^[A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€\n\r]*$/;

export function nonGsmCharacters(text: string): string[] {
  const offenders = new Set<string>();
  for (const character of text) {
    if (!GSM7.test(character)) offenders.add(character);
  }
  return [...offenders];
}
