"use client";

import { useMemo } from "react";
import { COUNTRY_DIAL_CODES } from "@/lib/countryDialCodes";

type CountryPhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  inputClassName?: string;
  selectClassName?: string;
};

const DEFAULT_COUNTRY_ISO = "US";

function dialCodeDigits(dialCode: string) {
  return dialCode.replace(/\D/g, "");
}

function formatPhone(dialCode: string, nationalNumber: string) {
  const number = nationalNumber.trim();
  return number ? `${dialCode} ${number}` : `${dialCode} `;
}

function parsePhoneValue(value: string) {
  const trimmed = value.trim();
  const matchedCountry = [...COUNTRY_DIAL_CODES]
    .sort((a, b) => dialCodeDigits(b.dialCode).length - dialCodeDigits(a.dialCode).length)
    .find((country) => trimmed.replace(/\D/g, "").startsWith(dialCodeDigits(country.dialCode)));

  if (!matchedCountry) {
    return {
      iso: DEFAULT_COUNTRY_ISO,
      nationalNumber: trimmed,
    };
  }

  const dialDigits = dialCodeDigits(matchedCountry.dialCode);
  const valueDigits = trimmed.replace(/\D/g, "");
  const nationalNumber = valueDigits.startsWith(dialDigits)
    ? valueDigits.slice(dialDigits.length)
    : trimmed.replace(matchedCountry.dialCode, "").trim();

  return { iso: matchedCountry.iso, nationalNumber };
}

export function CountryPhoneInput({
  value,
  onChange,
  required,
  inputClassName = "input-dark",
  selectClassName = "input-dark",
}: CountryPhoneInputProps) {
  const parsed = useMemo(() => parsePhoneValue(value), [value]);

  const selectedCountry =
    COUNTRY_DIAL_CODES.find((country) => country.iso === parsed.iso) ??
    COUNTRY_DIAL_CODES.find((country) => country.iso === DEFAULT_COUNTRY_ISO)!;

  function handleCountryChange(nextIso: string) {
    const nextCountry =
      COUNTRY_DIAL_CODES.find((country) => country.iso === nextIso) ?? selectedCountry;
    onChange(formatPhone(nextCountry.dialCode, parsed.nationalNumber));
  }

  function handleNumberChange(nextNumber: string) {
    const cleanedNumber = nextNumber.replace(/[^\d\s().-]/g, "");
    onChange(formatPhone(selectedCountry.dialCode, cleanedNumber));
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_1fr]">
      <select
        value={selectedCountry.iso}
        onChange={(event) => handleCountryChange(event.target.value)}
        className={selectClassName}
        aria-label="Country code"
      >
        {COUNTRY_DIAL_CODES.map((country) => (
          <option key={country.iso} value={country.iso}>
            {country.name} ({country.dialCode})
          </option>
        ))}
      </select>
      <input
        type="tel"
        value={parsed.nationalNumber}
        onChange={(event) => handleNumberChange(event.target.value)}
        required={required}
        className={inputClassName}
        placeholder="Phone number"
      />
    </div>
  );
}
