import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qrfdpzigcarbethrsioe.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZmRwemlnY2FyYmV0aHJzaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDA5MTAsImV4cCI6MjA5OTg3NjkxMH0.4-woG-u6WXp48RCGqVFf_gZ2aVYwYHStZiEJ8EzLXk0';

let version = process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : '';
if (!version) {
  try {
    version = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    version = 'dev';
  }
}

try {
  mkdirSync('public', { recursive: true });
  writeFileSync('public/config.js', `window.DIDIDO_CONFIG = ${JSON.stringify({ url, key, version })};\n`);
  console.log(`Successfully generated public/config.js (version: ${version})`);
} catch (err) {
  console.error('Failed to generate public/config.js:', err);
}
