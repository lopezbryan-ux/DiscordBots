export interface BodyWeightLog {
	_id?: string; // or ObjectId if using mongodb types
	username: string;
	date: string;
	bodyweight: number;
	additionaldetails: string;
}
