export interface MeasurementsLog {
  _id?: string; // or ObjectId
  username: string;
  date: string; // YYYY-MM-DD
  unit?: 'in';
  bicep?: number;
  forearm?: number;
  wrist?: number;
  chest?: number;
  quad?: number;
  notes?: string;
}
