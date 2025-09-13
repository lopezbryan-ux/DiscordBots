import db from './src/utils/db.ts';

const rows = db.prepare('SELECT * FROM lifts').all();
console.log(rows);
