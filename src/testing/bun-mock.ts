// @ts-nocheck
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

const mockFn = (implementation?: any) => {
  return vi.fn(implementation);
};

mockFn.module = (modulePath: string, factory: () => any) => {
  vi.doMock(modulePath, factory);
};

export {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mockFn as mock
};
