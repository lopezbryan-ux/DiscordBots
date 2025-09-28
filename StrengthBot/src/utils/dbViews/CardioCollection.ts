export interface CardioLog {
	_id: string; // or ObjectId if using mongodb types
	username: string;
	date: string;
	cardioType: string;
	time: string;
	distance: number;
	bodyweight: number;
	additionaldetails: string;
	logCategory: string;
}
