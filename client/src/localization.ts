import { useMemo } from "react";
import type { Language } from "../../shared/types";
import { copy, skillNames } from "./i18n";
import { messages } from "./locales/messages";
import { useSession } from "./store/session";

export const locales: Record<Language, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
};
const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
const dictionary = new Map<string, Record<Language, string>>();
const originals = new Map<string, string>();
function add(en: string, hi: string, mr: string) {
  const key = normalize(en);
  const values = { en, hi, mr };
  dictionary.set(key, values);
  for (const value of Object.values(values))
    originals.set(normalize(value), key);
}
for (const [key, value] of Object.entries(copy.en)) {
  const hi = copy.hi[key as keyof typeof copy.hi],
    mr = copy.mr[key as keyof typeof copy.mr];
  if (
    typeof value === "string" &&
    typeof hi === "string" &&
    typeof mr === "string"
  )
    add(value, hi, mr);
}
for (const values of Object.values(skillNames))
  add(values.en, values.hi, values.mr);
for (const row of messages) add(...row);
export function registerMessages(rows: readonly (readonly [string,string,string])[]) {
  for(const row of rows) if(!dictionary.has(normalize(row[0]))) add(...row);
}

// This translates displayed copy only. Form values, API IDs and saved canonical labels stay unchanged.
// Non-string React children pass through without altering elements, handlers, keys or refs.
export function translate<T>(
  value: T,
  language: Language,
  variables?: Record<string, string | number>,
): T {
  if (typeof value !== "string") return value;
  const key = originals.get(normalize(value)) ?? normalize(value);
  let translated = dictionary.get(key)?.[language];
  if (language === "en" && normalize(value) === key) translated = value.trim();
  if (translated === undefined) {
    const verificationPrompt = /^Before starting, say (.+) and show your tester to the camera\.$/.exec(value);
    if (verificationPrompt) return translate("Before starting, say {id} and show your tester to the camera.", language, { id: verificationPrompt[1] }) as T;
    const csvRow = /^Invalid CSV row (\d+)$/.exec(value);
    if (csvRow)
      return translate("Invalid CSV row {count}", language, {
        count: csvRow[1],
      }) as T;
    const lengthError =
      /^String must contain (at least|at most) (\d+) character\(s\)\.?$/.exec(
        value,
      );
    if (lengthError)
      return translate(
        lengthError[1] === "at least"
          ? "Use at least {count} characters."
          : "Use no more than {count} characters.",
        language,
        { count: lengthError[2] },
      ) as T;
    const arrayError =
      /^Array must contain (at least|at most|exactly) (\d+) element\(s\)\.?$/.exec(
        value,
      );
    if (arrayError)
      return translate(
        arrayError[1] === "at least"
          ? "Choose at least {count} items."
          : arrayError[1] === "at most"
            ? "Choose no more than {count} items."
            : "Choose exactly {count} items.",
        language,
        { count: arrayError[2] },
      ) as T;
    const numberError =
      /^Number must be (greater than or equal to|less than or equal to) (\d+)\.?$/.exec(
        value,
      );
    if (numberError)
      return translate(
        numberError[1] === "greater than or equal to"
          ? "Enter a number of at least {count}."
          : "Enter a number no greater than {count}.",
        language,
        { count: numberError[2] },
      ) as T;
    if (value === "Expected integer, received float")
      return translate("Enter a whole number.", language) as T;
    if (value.includes(". ")) {
      const parts = value.split(". ").map((part) => translate(part, language));
      if (parts.some((part, index) => part !== value.split(". ")[index]))
        return parts.join(" · ") as T;
    }
    return value;
  }
  const result =
    (value.match(/^\s*/)?.[0] ?? "") +
    translated +
    (value.match(/\s*$/)?.[0] ?? "");
  return result.replace(/\{(\w+)\}/g, (match, name: string) =>
    String(variables?.[name] ?? match),
  ) as T;
}
export function hasTranslation(message: string) {
  return dictionary.has(normalize(message));
}
export function useTranslate() {
  const { language } = useSession();
  return useMemo(
    () =>
      Object.assign(
        <T>(value: T, variables?: Record<string, string | number>): T =>
          translate(value, language, variables),
        { locale: locales[language] },
      ),
    [language],
  );
}
