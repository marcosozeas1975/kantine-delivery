import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let firebaseConfig: { projectId?: string } = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  console.warn('[firebase-admin] Failed to load firebase-applet-config.json:', e);
}

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID,
  });
}

export const adminAuth = getAuth();

