/**
 * Simple JSON file store for users and mappings.
 * On Vercel, the filesystem is read-only at runtime, so we use
 * environment variables as fallback and edge-compatible KV if needed.
 * For now, this uses /tmp for Vercel serverless (persists within a single invocation window).
 * For production, swap this with a proper database (Vercel KV, Supabase, etc).
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.VERCEL ? '/tmp/aiotasksync' : path.join(process.cwd(), 'data');

export interface User {
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface Mapping {
  projectId: string;
  projectName: string;
  companyName?: string;
  dealName?: string;
}

export interface Mappings {
  companies: Record<string, Mapping>;
  deals: Record<string, Mapping>;
}

async function ensureDir() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch {}
}

async function readJSON<T>(filename: string, fallback: T): Promise<T> {
  try {
    await ensureDir();
    const data = await readFile(path.join(DATA_DIR, filename), 'utf8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(filename: string, data: T): Promise<void> {
  await ensureDir();
  await writeFile(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// --- Users ---

export async function getUsers(): Promise<User[]> {
  return readJSON<User[]>('users.json', []);
}

export async function addUser(user: User): Promise<void> {
  const users = await getUsers();
  const existing = users.findIndex(u => u.email === user.email);
  if (existing >= 0) {
    users[existing] = user;
  } else {
    users.push(user);
  }
  await writeJSON('users.json', users);
}

export async function removeUser(email: string): Promise<void> {
  const users = await getUsers();
  await writeJSON('users.json', users.filter(u => u.email !== email));
}

export async function findUser(email: string): Promise<User | undefined> {
  const users = await getUsers();
  return users.find(u => u.email === email);
}

// --- Mappings ---

export async function getMappings(): Promise<Mappings> {
  return readJSON<Mappings>('mappings.json', { companies: {}, deals: {} });
}

export async function saveMappings(mappings: Mappings): Promise<void> {
  await writeJSON('mappings.json', mappings);
}

// --- Sync State (tracks last sync per mapping to detect changes) ---

export interface SyncState {
  lastSync: Record<string, string>; // key: "companies:id" or "deals:id", value: project modified_at
  lastRun?: string;
}

export async function getSyncState(): Promise<SyncState> {
  return readJSON<SyncState>('sync-state.json', { lastSync: {} });
}

export async function saveSyncState(state: SyncState): Promise<void> {
  state.lastRun = new Date().toISOString();
  await writeJSON('sync-state.json', state);
}
