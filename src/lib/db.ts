// Wrapper for database connection to maintain compatibility with chatbot API routes
import { db } from './database';

// Export query function that matches the chatbot API expectations
export async function query(text: string, params?: any[]) {
  return await db.query(text, params);
}

// Export transaction function
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  return await db.transaction(callback);
}

// Re-export the database instance as default
export default db;
