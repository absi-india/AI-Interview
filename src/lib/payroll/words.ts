/**
 * Amount in words, Indian numbering (lakh / crore), to two decimal places.
 * 43646.93 becomes "Forty-Three Thousand Six Hundred And Forty-Six Rupees and
 * Ninety-Three Paise Only".
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]}-${ONES[o]}` : TENS[t];
}

function underThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h && rest) return `${ONES[h]} Hundred And ${underHundred(rest)}`;
  if (h) return `${ONES[h]} Hundred`;
  return underHundred(rest);
}

/** Indian grouping: crore, lakh, thousand, then the last three digits. */
function indianWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const rupees = Math.floor(safe);
  // Rounded rather than truncated, so 0.925 does not come out as 92 paise.
  const paise = Math.round((safe - rupees) * 100);

  const rupeeWords = `${indianWords(rupees)} Rupees`;
  const sign = amount < 0 ? "Minus " : "";
  if (paise > 0) return `${sign}${rupeeWords} and ${indianWords(paise)} Paise Only`;
  return `${sign}${rupeeWords} Only`;
}
