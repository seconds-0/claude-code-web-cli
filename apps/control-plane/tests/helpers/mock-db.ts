/**
 * Database Mock Utilities
 *
 * Provides mock database instances and query builders for billing tests.
 */

import { vi } from "vitest";

/**
 * Create a chainable mock database
 */
export function createMockDb() {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
  };

  return chainable;
}

export type MockDb = ReturnType<typeof createMockDb>;

/**
 * Reset all mocks on a mock database
 */
export function resetMockDb(db: MockDb): void {
  Object.values(db).forEach((mock) => {
    if (typeof mock.mockReset === "function") {
      mock.mockReset();
      mock.mockReturnThis();
    }
  });
  // Reset terminal methods
  db.limit.mockResolvedValue([]);
  db.returning.mockResolvedValue([]);
}

/**
 * Configure mock to return specific data on select query
 */
export function mockSelect(db: MockDb, data: unknown[]): void {
  db.limit.mockResolvedValue(data);
}

/**
 * Configure mock to return data from insert
 */
export function mockInsert(db: MockDb, data: unknown[]): void {
  db.returning.mockResolvedValue(data);
}

/**
 * Configure mock to return data from update
 */
export function mockUpdate(db: MockDb, data: unknown[]): void {
  db.returning.mockResolvedValue(data);
}

/**
 * Configure mock to throw on insert (for duplicate key tests)
 */
export function mockInsertConflict(db: MockDb): void {
  db.returning.mockRejectedValue(new Error("duplicate key value violates unique constraint"));
}
