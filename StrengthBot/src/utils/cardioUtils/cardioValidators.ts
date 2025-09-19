export const ValidateTime = (time: string): boolean => {
  // Valid formats: MM:SS or M:SS
  const timeRegex = /^\d{1,2}:\d{2}$/;
  if (!timeRegex.test(time)) return false;

  const [minutes, seconds] = time.split(':').map(Number);
  if (isNaN(minutes) || isNaN(seconds)) return false;
  if (minutes < 0 || seconds < 0 || seconds >= 60) return false;

  return true;
};

export const ValidateDistance = (distance: number): boolean => {
  return distance > 0;
};
