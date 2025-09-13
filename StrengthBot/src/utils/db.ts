import Database from 'better-sqlite3';

import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file will be in the project root
const dbPath = path.resolve(__dirname, '../../strengthbot.db');
const db = new Database(dbPath);

const createTable = `
CREATE TABLE IF NOT EXISTS lifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    date DATE NOT NULL,
    exercise TEXT NOT NULL,
    amount REAL NOT NULL,
    bodyweight REAL NOT NULL,
    additionalDetails TEXT DEFAULT '',
    liftCategory TEXT NOT NULL
);
`;

db.exec(createTable);

export default db;
