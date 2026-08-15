import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  differenceInMinutes,
} from 'date-fns';

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function getMonthGrid(date: Date): Date[][] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export interface MeetingPosition {
  top: string; // percentage or px
  height: string;
}

export function positionMeeting(
  startsAt: string,
  endsAt: string | null,
  dayStartHour: number = 7,
  dayEndHour: number = 22,
): MeetingPosition {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 30 * 60 * 1000);

  const dayMinutes = (dayEndHour - dayStartHour) * 60;
  const startMinutes = (start.getHours() - dayStartHour) * 60 + start.getMinutes();
  const durationMinutes = Math.max(differenceInMinutes(end, start), 15);

  const top = Math.max(0, (startMinutes / dayMinutes) * 100);
  const height = Math.min((durationMinutes / dayMinutes) * 100, 100 - top);

  return {
    top: `${top}%`,
    height: `${Math.max(height, 2)}%`, // min 2% for visibility
  };
}
