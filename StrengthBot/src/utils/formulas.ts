export interface OneRepMaxFormula {
  name: string;
  calc: (weight: number, reps: number) => number;
  desc: string;
}

export const oneRepMaxFormulas: Record<string, OneRepMaxFormula> = {
  lombardi: {
    name: 'Lombardi',
    calc: (weight, reps) => weight * Math.pow(reps, 0.1),
    desc: '1RM = weight × reps^0.10',
  },
  brzycki: {
    name: 'Brzycki',
    calc: (weight, reps) => weight * (36 / (37 - reps)),
    desc: '1RM = weight × (36 / (37 - reps))',
  },
  epley: {
    name: 'Epley',
    calc: (weight, reps) => weight * (1 + reps / 30),
    desc: '1RM = weight × (1 + reps / 30)',
  },
  mayhew: {
    name: 'Mayhew',
    calc: (weight, reps) => (weight * 100) / (52.2 + 41.9 * Math.exp(-0.055 * reps)),
    desc: '1RM = weight × 100 / (52.2 + 41.9 × e^(–0.055 × reps))',
  },
  oconner: {
    name: 'O’Conner',
    calc: (weight, reps) => weight * (1 + 0.025 * reps),
    desc: '1RM = weight × (1 + 0.025 × reps)',
  },
  wathan: {
    name: 'Wathan',
    calc: (weight, reps) => (weight * 100) / (48.8 + 53.8 * Math.exp(-0.075 * reps)),
    desc: '1RM = weight × 100 / (48.8 + 53.8 × e^(–0.075 × reps))',
  },
  lander: {
    name: 'Lander',
    calc: (weight, reps) => (weight * 100) / (101.3 - 2.67123 * reps),
    desc: '1RM = weight × 100 / (101.3 – 2.67123 × reps)',
  },
};
