import { writeFileSync, mkdirSync } from 'node:fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qrfdpzigcarbethrsioe.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZmRwemlnY2FyYmV0aHJzaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDA5MTAsImV4cCI6MjA5OTg3NjkxMH0.4-woG-u6WXp48RCGqVFf_gZ2aVYwYHStZiEJ8EzLXk0';

try {
  mkdirSync('public', { recursive: true });
  writeFileSync('public/config.js', `window.DIDIDO_CONFIG = ${JSON.stringify({ url, key })};\n`);
  console.log('Successfully generated public/config.js');
} catch (err) {
  console.error('Failed to generate public/config.js:', err);
}
