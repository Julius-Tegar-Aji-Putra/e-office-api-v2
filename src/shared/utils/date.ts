/**
 * Date Utilities
 */

/**
 * Format date to Indonesian locale
 */
export function formatDateID(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format datetime to Indonesian locale
 */
export function formatDateTimeID(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format to ISO date string (YYYY-MM-DD)
 */
export function toISODateString(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Get current year
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Get current month (1-12)
 */
export function getCurrentMonth(): number {
  return new Date().getMonth() + 1;
}

/**
 * Check if date is in the past
 */
export function isPastDate(date: Date | string): boolean {
  const d = new Date(date);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return d < now;
}

/**
 * Check if date is today
 */
export function isToday(date: Date | string): boolean {
  const d = new Date(date);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

/**
 * Add days to date
 */
export function addDays(date: Date | string, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Get start of day
 */
export function startOfDay(date: Date | string): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date | string): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Calculate duration in days
 */
export function durationInDays(startDate: Date | string, endDate: Date | string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format date range
 */
export function formatDateRange(startDate: Date | string, endDate: Date | string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start.toDateString() === end.toDateString()) {
    return formatDateID(start);
  }
  
  // Same month and year
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} - ${formatDateID(end)}`;
  }
  
  return `${formatDateID(start)} - ${formatDateID(end)}`;
}
