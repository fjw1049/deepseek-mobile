export type Frequency = "daily" | "weekdays" | "custom";
export function parseSchedule(cron: string): { frequency: Frequency; time: string } {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* (\*|1-5)$/.exec(cron);
  if (!match || +match[1] > 59 || +match[2] > 23) return { frequency: "custom", time: "09:00" };
  return { frequency: match[3] === "*" ? "daily" : "weekdays", time: `${match[2].padStart(2, "0")}:${match[1].padStart(2, "0")}` };
}
export function makeSchedule(frequency: Frequency, time: string, custom: string): string {
  if (frequency === "custom") return custom.trim();
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || +match[1] > 23 || +match[2] > 59) throw new Error("请选择有效的执行时间");
  return `${+match[2]} ${+match[1]} * * ${frequency === "daily" ? "*" : "1-5"}`;
}
export function localDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
