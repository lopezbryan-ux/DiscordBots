export interface LiftingLog {
	_id?: string; // or ObjectId if using mongodb types
	username: string;
	date: string;
	exercise: string;
	amount: number;
	bodyweight: number;
	additionaldetails: string;
	liftCategory: string;
}
