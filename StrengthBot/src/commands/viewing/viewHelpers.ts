import { ObjectId } from 'mongodb';

export const DATABASE_NAME = 'StrengthBotDb';
export const LIFTS_COLLECTION = 'StrengthBotCollection';
export const BODY_WEIGHT_COLLECTION = 'StrengthBotBodyWeight';
export const CARDIO_COLLECTION = 'StrengthBotCardioCollection';
export const MAX_EMBED_FIELDS = 25;

export type LiftSortOption = 'amount-desc' | 'amount-asc' | 'bodyweight-desc' | 'bodyweight-asc' | 'date-desc' | 'date-asc';

export interface LiftLog {
  _id: ObjectId;
  username: string;
  date: string;
  exercise: string;
  amount: number;
  bodyweight: number;
  additionaldetails?: string;
  liftCategory: string;
}

export interface BodyWeightLog {
  _id: ObjectId;
  username: string;
  date: string;
  bodyweight: number;
  additionaldetails?: string;
}

export interface CardioLog {
  _id: ObjectId;
  username: string;
  date: string;
  cardioType: string;
  time: string;
  distance: number;
  bodyweight: number;
  additionaldetails?: string;
}

export const liftSortChoices = [
  { name: 'Amount (Descending)', value: 'amount-desc' },
  { name: 'Amount (Ascending)', value: 'amount-asc' },
  { name: 'Bodyweight (Descending)', value: 'bodyweight-desc' },
  { name: 'Bodyweight (Ascending)', value: 'bodyweight-asc' },
  { name: 'Date Added (Newest First)', value: 'date-desc' },
  { name: 'Date Added (Oldest First)', value: 'date-asc' },
] as const;

export function formatDateOnly(date: string): string {
  return date.split('T')[0] || date;
}

export function sortLiftLogs(logs: LiftLog[], sortOption?: string | null): LiftLog[] {
  const sorted = [...logs];

  switch (sortOption) {
    case 'amount-asc':
      return sorted.sort((a, b) => a.amount - b.amount);
    case 'amount-desc':
      return sorted.sort((a, b) => b.amount - a.amount);
    case 'bodyweight-asc':
      return sorted.sort((a, b) => a.bodyweight - b.bodyweight);
    case 'bodyweight-desc':
      return sorted.sort((a, b) => b.bodyweight - a.bodyweight);
    case 'date-asc':
      return sorted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    case 'date-desc':
    default:
      return sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}

export function getHeaviestByExercise(logs: LiftLog[]): LiftLog[] {
  const heaviestByExercise = new Map<string, LiftLog>();

  for (const log of logs) {
    const current = heaviestByExercise.get(log.exercise);
    if (!current || log.amount > current.amount) {
      heaviestByExercise.set(log.exercise, log);
    }
  }

  return [...heaviestByExercise.values()];
}

export function buildLiftField(log: LiftLog): { name: string; value: string; inline: false } {
  const value = [`**Amount:** ${log.amount} lbs`, `**Bodyweight:** ${log.bodyweight} lbs`, `**Date:** ${formatDateOnly(log.date)}`];

  if (log.additionaldetails) {
    value.push(`**Details:** ${log.additionaldetails}`);
  }

  return {
    name: `${log.exercise} (ID: ${log._id})`,
    value: value.join('\n'),
    inline: false,
  };
}
