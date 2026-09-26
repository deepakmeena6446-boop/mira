import { afterEach, describe, expect, it, vi } from "vitest";
import { createResendMailer, RESEND_ENDPOINT } from "@/server/mail/resend";
import { getMailer, resetMailer } from "@/server/mail";
import { resetEnvCache } from "@/server/config/env";
import { applyTestEnv } from "../setup/test-env";

const ADDRESS = "private.person@example.test";
const KEY = "re_unit_test_key";
const MAIL = { to: ADDRESS, subject: "Asha missed their check-in on MIRA", text: "secret body with a /t/abc link" };

type Call = { url: string; init: RequestInit };

function harness(responses: Array<number | "timeout" | "refused" | "reset">, timeoutMs = 30) {
  const calls: Call[] = [];
  const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const queue = [...responses];
  const fetchStub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    const next = queue.shift() ?? 200;
    if (next === "timeout") {
      // Honour the adapter's AbortSignal like real fetch does.
      return new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)));
    }
    if (next === "refused") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    if (next === "reset") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    return new Response(next < 300 ? '{"id":"x"}' : `{"message":"Invalid to: ${ADDRESS}"}`, { status: next });
  });
  const mailer = createResendMailer({
    apiKey: KEY,
    from: "MIRA <alerts@mira.test>",
    timeoutMs,
    retryDelayMs: 0,
    fetch: fetchStub as unknown as typeof fetch,
    log: (event, fields) => logs.push({ event, fields }),
  });
  return { mailer, calls, logs };
}

describe("Resend adapter", () => {
  it("POSTs JSON with a Bearer key, a timeout signal and an idempotency key", async () => {
    const { mailer, calls } = harness([200]);
    expect(await mailer.send(MAIL)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe(RESEND_ENDPOINT);
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const h = new Headers(init.headers);
    expect(h.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("idempotency-key")).toMatch(/^mira-[0-9a-f-]{36}$/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({ from: "MIRA <alerts@mira.test>", to: [ADDRESS], subject: MAIL.subject, text: MAIL.text });
  });

  it("uses the caller's idempotency key when given", async () => {
    const { mailer, calls } = harness([200]);
    await mailer.send({ ...MAIL, idempotencyKey: "journey-1-alert" });
    expect(new Headers(calls[0].init.headers).get("idempotency-key")).toBe("journey-1-alert");
  });

  it("a 4xx refusal is a definite failure and is not retried", async () => {
    for (const status of [400, 401, 403, 422, 429]) {
      const { mailer, calls } = harness([status]);
      expect(await mailer.send(MAIL)).toEqual({ ok: false, definite: true });
      expect(calls).toHaveLength(1);
    }
  });

  it("a 5xx is uncertain: retried once with the SAME idempotency key, then unconfirmed", async () => {
    const { mailer, calls } = harness([503, 500]);
    expect(await mailer.send(MAIL)).toEqual({ ok: false, definite: false });
    expect(calls).toHaveLength(2);
    const keys = calls.map((c) => new Headers(c.init.headers).get("idempotency-key"));
    expect(keys[0]).toBe(keys[1]);
  });

  it("a retry that succeeds counts as sent", async () => {
    const { mailer, calls } = harness([502, 200]);
    expect(await mailer.send(MAIL)).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("a timeout is unconfirmed (never 'sent', never 'failed')", async () => {
    const { mailer, calls } = harness(["timeout", "timeout"], 20);
    expect(await mailer.send(MAIL)).toEqual({ ok: false, definite: false });
    expect(calls).toHaveLength(2);
  });

  it("a connection that never opened is a definite failure; a reset mid-request is not", async () => {
    expect(await harness(["refused", "refused"]).mailer.send(MAIL)).toEqual({ ok: false, definite: true });
    expect(await harness(["reset", "refused"]).mailer.send(MAIL)).toEqual({ ok: false, definite: false });
  });

  it("never logs the address, subject, body or key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { mailer, logs } = harness([422]);
      await mailer.send(MAIL);
      const noisy = harness([500, "timeout"], 10);
      await noisy.mailer.send(MAIL);
      const everything = JSON.stringify([logs, noisy.logs, warn.mock.calls, log.mock.calls]);
      expect(noisy.logs.length + logs.length).toBeGreaterThan(0);
      for (const secret of [ADDRESS, "private.person", MAIL.subject, "secret body", KEY]) expect(everything).not.toContain(secret);
      // Default logger (console) is equally clean.
      const plain = createResendMailer({ apiKey: KEY, from: "a@b.test", retryDelayMs: 0, fetch: (async () => new Response("", { status: 400 })) as unknown as typeof fetch });
      await plain.send(MAIL);
      const consoleText = JSON.stringify([warn.mock.calls, log.mock.calls]);
      expect(warn).toHaveBeenCalled();
      for (const secret of [ADDRESS, MAIL.subject, KEY]) expect(consoleText).not.toContain(secret);
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });
});

describe("getMailer provider selection", () => {
  afterEach(() => {
    applyTestEnv();
    resetEnvCache();
    resetMailer();
    vi.unstubAllGlobals();
  });

  it("uses Resend when RESEND_API_KEY + EMAIL_FROM are set, even if SMTP is also configured", async () => {
    applyTestEnv({ RESEND_API_KEY: KEY, EMAIL_FROM: "MIRA <alerts@mira.test>", SMTP_HOST: "127.0.0.1", SMTP_FROM: "x@mira.test" });
    resetEnvCache();
    resetMailer();
    const fetchStub = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    expect(await getMailer()!.send(MAIL)).toEqual({ ok: true });
    expect(fetchStub).toHaveBeenCalledWith(RESEND_ENDPOINT, expect.anything());
  });

  it("is null with no provider", () => {
    applyTestEnv();
    resetEnvCache();
    resetMailer();
    expect(getMailer()).toBeNull();
  });
});
