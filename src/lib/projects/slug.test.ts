import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Acme Web Shop")).toBe("acme-web-shop");
  });

  it("strips accents", () => {
    expect(slugify("Łódź Café Naïve")).toBe("lodz-cafe-naive");
  });

  it("drops symbols and collapses runs", () => {
    expect(slugify("Foo!!  @@  Bar__Baz")).toBe("foo-bar-baz");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("is idempotent on an already-valid slug", () => {
    expect(slugify("acme-web-shop")).toBe("acme-web-shop");
  });

  it("returns empty string when nothing usable remains", () => {
    expect(slugify("!!! ___ !!!")).toBe("");
  });
});
