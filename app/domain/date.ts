import type { DayPlan } from "./types";

export function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shortDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function compactDateLabel(value: string) {
  const match = value.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : value;
}

export function nextDateLabel(value: string) {
  const match = value.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  if (!match) return "날짜 미정";
  const date = new Date(2026, Number(match[1]) - 1, Number(match[2]) + 1);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function dateInputValue(value: string) {
  const match = value.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${new Date().getFullYear()}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

export function nextIsoDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return isoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

export function comparableDate(day?: DayPlan) {
  if (!day) return null;
  if (day.dateValue) return day.dateValue;
  const match = day.date.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  return match ? isoDate(new Date().getFullYear(), Number(match[1]) - 1, Number(match[2])) : null;
}
