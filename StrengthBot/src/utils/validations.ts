export function validateAmount(amount: number): string | null {
  if (typeof amount !== 'number' || isNaN(amount)) return 'Amount lifted must be a number.';
  if (amount <= 0) return 'Amount lifted must be greater than 0.';
  return null;
}

export function validateBodyweight(bodyweight: number): string | null {
  if (typeof bodyweight !== 'number' || isNaN(bodyweight)) return 'Bodyweight must be a number.';
  if (bodyweight <= 0) return 'Bodyweight must be greater than 0.';
  return null;
}
