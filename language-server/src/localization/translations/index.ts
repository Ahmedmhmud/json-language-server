import enUS from "./en-US.ts";

export type Translation = {
  ftl: string;
  direction: "ltr" | "rtl";
};

export const translations: Record<string, Translation> = {
  "en-US": { ftl: enUS, direction: "ltr" }
};
