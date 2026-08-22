import { afterEach, describe, expect, it } from "vitest";
import { isSameOriginMutation } from "@/lib/security/request";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("same-origin mutation protection", () => {
  it("accepts the request origin", () => {
    const request = new Request("https://app.example.com/api/test", { headers: { origin: "https://app.example.com" } });
    expect(isSameOriginMutation(request)).toBe(true);
  });

  it("accepts the explicitly configured public origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://public.example.com";
    const request = new Request("https://internal-host/api/test", { headers: { origin: "https://public.example.com" } });
    expect(isSameOriginMutation(request)).toBe(true);
  });

  it("rejects missing and cross-site origins", () => {
    expect(isSameOriginMutation(new Request("https://app.example.com/api/test"))).toBe(false);
    const crossSite = new Request("https://app.example.com/api/test", { headers: { origin: "https://evil.example" } });
    expect(isSameOriginMutation(crossSite)).toBe(false);
  });
});
