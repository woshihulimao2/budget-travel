// Global test setup for vitest. Auto-cleanup after each @testing-library/react
// render so node trees from previous tests don't leak into the next one.

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});