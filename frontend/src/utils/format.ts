export function formatRupees(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const INDIAN_TIME_ZONE = "Asia/Kolkata";

export function formatIndianDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIAN_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatIndianTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIAN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatIndianDateTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIAN_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(value));
}
