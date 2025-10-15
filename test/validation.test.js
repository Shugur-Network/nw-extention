/**
 * @fileoverview Unit tests for validation utilities
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  validateAndParseURL,
  isValidPubkey,
  isValidRelay,
  sanitizeHTML,
  sanitizeCSS,
  checkRateLimit,
} from "../shared/validation.js";
import { ValidationError } from "../shared/errors.js";

describe("validateAndParseURL", () => {
  it("should parse valid domain without protocol", () => {
    const result = validateAndParseURL("example.com");
    assert.strictEqual(result.host, "example.com");
    assert.strictEqual(result.route, "/");
  });

  it("should parse valid domain with route", () => {
    const result = validateAndParseURL("example.com/about");
    assert.strictEqual(result.host, "example.com");
    assert.strictEqual(result.route, "/about");
  });

  it("should parse subdomain correctly", () => {
    const result = validateAndParseURL("blog.example.com/post/123");
    assert.strictEqual(result.host, "blog.example.com");
    assert.strictEqual(result.route, "/post/123");
  });

  it("should throw on empty input", () => {
    assert.throws(() => validateAndParseURL(""), ValidationError);
    assert.throws(() => validateAndParseURL("   "), ValidationError);
    assert.throws(() => validateAndParseURL(null), ValidationError);
  });

  it("should throw on invalid domain", () => {
    // Spaces are invalid
    assert.throws(() => validateAndParseURL("not a domain"), ValidationError);
    // Double dots are invalid (directory traversal)
    assert.throws(() => validateAndParseURL("example..com"), ValidationError);
  });

  it("should throw on unsupported protocol", () => {
    assert.throws(
      () => validateAndParseURL("https://example.com"),
      ValidationError
    );
    assert.throws(
      () => validateAndParseURL("http://example.com"),
      ValidationError
    );
    assert.throws(
      () => validateAndParseURL("ftp://example.com"),
      ValidationError
    );
  });

  it("should reject suspicious patterns", () => {
    assert.throws(
      () => validateAndParseURL("example.com/<script>"),
      ValidationError
    );
    // Query strings are blocked by suspicious pattern validation
    assert.throws(
      () => validateAndParseURL("example.com/path?query=value"),
      ValidationError
    );
  });

  it("should handle simple routes", () => {
    const result = validateAndParseURL("example.com/about/team");
    assert.strictEqual(result.host, "example.com");
    assert.strictEqual(result.route, "/about/team");
  });
});

describe("isValidPubkey", () => {
  it("should accept valid 64-char hex pubkey", () => {
    const validHex = "a".repeat(64);
    assert.strictEqual(isValidPubkey(validHex), true);
  });

  it("should accept mixed case hex", () => {
    const mixedHex = "A1b2C3d4E5f6" + "0".repeat(52);
    assert.strictEqual(isValidPubkey(mixedHex), true);
  });

  it("should accept valid npub format (approximately)", () => {
    // Note: Real npub validation would require bech32 decoding
    // This just checks the format pattern: npub1 + 58 chars = 63 total
    const validNpub = "npub1" + "a".repeat(58);
    assert.strictEqual(isValidPubkey(validNpub), true);
    assert.strictEqual(validNpub.length, 63);
  });

  it("should reject invalid hex length", () => {
    assert.strictEqual(isValidPubkey("a".repeat(63)), false);
    assert.strictEqual(isValidPubkey("a".repeat(65)), false);
  });

  it("should reject invalid hex characters", () => {
    const invalidHex = "g".repeat(64);
    assert.strictEqual(isValidPubkey(invalidHex), false);
  });

  it("should reject invalid npub length", () => {
    // Too short (62 chars)
    assert.strictEqual(isValidPubkey("npub1" + "a".repeat(57)), false);
    // Too long (64 chars)
    assert.strictEqual(isValidPubkey("npub1" + "a".repeat(59)), false);
  });

  it("should reject empty/null/undefined", () => {
    assert.strictEqual(isValidPubkey(""), false);
    assert.strictEqual(isValidPubkey(null), false);
    assert.strictEqual(isValidPubkey(undefined), false);
  });
});

describe("isValidRelay", () => {
  it("should accept valid wss relay", () => {
    assert.strictEqual(isValidRelay("wss://relay.example.com"), true);
  });

  it("should accept valid ws relay", () => {
    assert.strictEqual(isValidRelay("ws://localhost:8080"), true);
  });

  it("should reject http/https URLs", () => {
    assert.strictEqual(isValidRelay("https://relay.example.com"), false);
    assert.strictEqual(isValidRelay("http://relay.example.com"), false);
  });

  it("should reject invalid URLs", () => {
    assert.strictEqual(isValidRelay("not a url"), false);
    assert.strictEqual(isValidRelay("relay.example.com"), false);
  });

  it("should reject empty/null/undefined", () => {
    assert.strictEqual(isValidRelay(""), false);
    assert.strictEqual(isValidRelay(null), false);
    assert.strictEqual(isValidRelay(undefined), false);
  });

  it("should handle relay with path", () => {
    assert.strictEqual(isValidRelay("wss://relay.example.com/nostr"), true);
  });
});

describe("sanitizeHTML", () => {
  it("should remove script tags", () => {
    const dirty = '<div>Safe</div><script>alert("xss")</script>';
    const clean = sanitizeHTML(dirty);
    assert.ok(!clean.includes("<script>"));
    assert.ok(clean.includes("<div>Safe</div>"));
  });

  it("should remove inline event handlers", () => {
    const dirty = '<button onclick="alert(1)">Click</button>';
    const clean = sanitizeHTML(dirty);
    assert.ok(!clean.includes("onclick"));
  });

  it("should remove javascript: protocol", () => {
    const dirty = '<a href="javascript:alert(1)">Link</a>';
    const clean = sanitizeHTML(dirty);
    assert.ok(!clean.toLowerCase().includes("javascript:"));
  });

  it("should handle multiple script tags", () => {
    const dirty = "<script>1</script><div>safe</div><script>2</script>";
    const clean = sanitizeHTML(dirty);
    assert.ok(!clean.includes("<script>"));
    assert.strictEqual((clean.match(/<script>/g) || []).length, 0);
  });

  it("should handle empty/null input", () => {
    assert.strictEqual(sanitizeHTML(""), "");
    assert.strictEqual(sanitizeHTML(null), "");
    assert.strictEqual(sanitizeHTML(undefined), "");
  });

  it("should preserve safe HTML", () => {
    const safe = '<h1>Title</h1><p>Paragraph</p><img src="image.jpg">';
    const clean = sanitizeHTML(safe);
    assert.ok(clean.includes("<h1>"));
    assert.ok(clean.includes("<p>"));
    assert.ok(clean.includes("<img"));
  });
});

describe("sanitizeCSS", () => {
  it("should remove javascript: protocol", () => {
    const dirty = "background: url(javascript:alert(1))";
    const clean = sanitizeCSS(dirty);
    assert.ok(!clean.toLowerCase().includes("javascript:"));
  });

  it("should remove expression() calls", () => {
    const dirty = "width: expression(alert(1))";
    const clean = sanitizeCSS(dirty);
    assert.ok(!clean.toLowerCase().includes("expression("));
  });

  it("should remove @import rules", () => {
    const dirty = '@import url("evil.css"); body { color: red; }';
    const clean = sanitizeCSS(dirty);
    assert.ok(!clean.toLowerCase().includes("@import"));
  });

  it("should handle empty/null input", () => {
    assert.strictEqual(sanitizeCSS(""), "");
    assert.strictEqual(sanitizeCSS(null), "");
    assert.strictEqual(sanitizeCSS(undefined), "");
  });

  it("should preserve safe CSS", () => {
    const safe = "body { color: red; font-size: 16px; }";
    const clean = sanitizeCSS(safe);
    assert.ok(clean.includes("color: red"));
    assert.ok(clean.includes("font-size: 16px"));
  });
});

describe("checkRateLimit", () => {
  it("should allow actions under limit", () => {
    const map = new Map();
    assert.strictEqual(checkRateLimit(map, "test", 10, 60000), true);
    assert.strictEqual(checkRateLimit(map, "test", 10, 60000), true);
    assert.strictEqual(checkRateLimit(map, "test", 10, 60000), true);
  });

  it("should block actions over limit", () => {
    const map = new Map();
    for (let i = 0; i < 5; i++) {
      checkRateLimit(map, "test", 5, 60000);
    }
    assert.strictEqual(checkRateLimit(map, "test", 5, 60000), false);
  });

  it("should reset after window expires", (t, done) => {
    const map = new Map();
    // Fill up to limit
    for (let i = 0; i < 3; i++) {
      checkRateLimit(map, "test", 3, 100);
    }
    assert.strictEqual(checkRateLimit(map, "test", 3, 100), false);

    // Wait for window to expire
    setTimeout(() => {
      assert.strictEqual(checkRateLimit(map, "test", 3, 100), true);
      done();
    }, 150);
  });

  it("should track different keys separately", () => {
    const map = new Map();
    checkRateLimit(map, "key1", 2, 60000);
    checkRateLimit(map, "key1", 2, 60000);
    checkRateLimit(map, "key2", 2, 60000);

    assert.strictEqual(checkRateLimit(map, "key1", 2, 60000), false);
    assert.strictEqual(checkRateLimit(map, "key2", 2, 60000), true);
  });
});
