// src/utils/liftChoices.ts

export const CompoundLifts = [
  { name: 'Barbell Squat', value: 'Barbell Squat' },
  { name: 'Barbell Bench', value: 'Barbell Bench' },
  { name: 'Barbell Deadlift', value: 'Barbell Deadlift' },
  { name: 'Chin Up (BW + Weights)', value: 'Chin Up (BW + Weights)' },
  { name: 'Barbell Standing OHP', value: 'Barbell Standing OHP' },
];

export const ArmWrestlingLifts = [
  { name: 'Side Pressure (Wrist wrench)', value: 'Side Pressure (Wrist wrench)' },
  { name: 'Static Pronation (Standing)', value: 'Static Pronation (Standing)' },
  { name: 'Static Riser (Standing)', value: 'Static Riser (Standing)' },
  { name: 'Partial Preacher Curl', value: 'Partial Preacher Curl' },
  { name: 'Wrist Curl', value: 'Wrist Curl' },
  { name: 'Supinating Press', value: 'Supinating Press' },
  { name: 'Full ROM Pronation Curl', value: 'Full ROM Pronation Curl' },
];

export const IsolationLifts = [{ name: 'Strict Curl', value: 'Strict Curl' }];

export const LiftingCategories = {
  Compound: 'Compound',
  Isolation: 'Isolation',
  ArmWrestling: 'ArmWrestling',
};
