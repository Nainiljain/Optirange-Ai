import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'

let db: Database | null = null

export async function openDb() {
  if (!db) {
    db = await open({
      filename: './optirange.db',
      driver: sqlite3.Database
    })
    
    // Initialize tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        profilePic TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS ev_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        make TEXT,
        model TEXT,
        batteryCapacity REAL,
        currentCharge REAL,
        rangeAtFull REAL,
        carPic TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS health_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER UNIQUE,
        age INTEGER,
        healthCondition TEXT,
        preferredRestInterval INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        startLocation TEXT,
        endLocation TEXT,
        distance REAL,
        estimatedTime TEXT,
        batteryUsed REAL,
        chargingStops INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
      );
    `)

    try {
      await db.run("ALTER TABLE users ADD COLUMN profilePic TEXT");
    } catch (e) {}

    try {
      await db.run("ALTER TABLE ev_data ADD COLUMN carPic TEXT");
    } catch (e) {}
  }
  return db
}
