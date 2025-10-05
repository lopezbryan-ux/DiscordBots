export type StrengthLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Elite' | 'Freak';

export interface StrengthStandard {
  [lift: string]: {
    [level in StrengthLevel]: string;
  };
}

export const strengthStandards: QuickChartDataSource[] = [
  {
    lift: 'Bench',
    beginner: '1X BW',
    intermediate: '1-1.5X BW',
    advanced: '1.5-2X BW',
    elite: '2-2.25X BW',
    freak: '2.25X+ BW',
  },
  {
    lift: 'Squat',
    beginner: '1.25X BW',
    intermediate: '1.25-1.75X BW',
    advanced: '1.75-2.5X BW',
    elite: '2.5-3X BW',
    freak: '3X+ BW',
  },
  {
    lift: 'Deadlift',
    beginner: '1.5X BW',
    intermediate: '1.5-2.25X BW',
    advanced: '2.25-3X BW',
    elite: '3-3.5X BW',
    freak: '3.5X+ BW',
  },
];

export const strengthStandardsColumns: QuickChartColumn[] = [
  { title: '', dataIndex: 'lift' },
  { title: 'Beginner', dataIndex: 'beginner' },
  { title: 'Intermediate', dataIndex: 'intermediate' },
  { title: 'Advanced', dataIndex: 'advanced' },
  { title: 'Elite', dataIndex: 'elite' },
  { title: 'Freak', dataIndex: 'freak' },
];

export interface QuickChartColumn {
  title: string;
  dataIndex: string;
}

export interface QuickChartDataSource {
  lift: string;
  beginner: string;
  intermediate: string;
  advanced: string;
  elite: string;
  freak: string;
}

export interface QuickChartConfig {
  columns: QuickChartColumn[];
  dataSource: unknown[];
}
