// Lets the engine tests run unchanged under `deno test` (they're written for vitest).
export { describe, it } from "jsr:@std/testing@1/bdd";
export { expect } from "jsr:@std/expect@1";
