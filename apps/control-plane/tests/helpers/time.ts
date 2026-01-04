/**
 * Time Testing Utilities
 *
 * Helpers for testing time-dependent billing logic.
 */

import { vi } from "vitest";

/**
 * Freeze time at a specific date
 */
export function freezeTime(date: Date): void {
  vi.useFakeTimers();
  vi.setSystemTime(date);
}

/**
 * Unfreeze time (restore real timers)
 */
export function unfreezeTime(): void {
  vi.useRealTimers();
}

/**
 * Create a date at start of month
 */
export function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

/**
 * Create a date at end of month
 */
export function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Create billing period from date
 */
export function createBillingPeriod(startDate: Date): { start: Date; end: Date } {
  const end = addMonths(startDate, 1);
  return { start: startDate, end };
}

/**
 * Calculate days remaining in period
 */
export function daysRemaining(endDate: Date, now: Date = new Date()): number {
  const diff = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
