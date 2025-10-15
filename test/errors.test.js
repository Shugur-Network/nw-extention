/**
 * @fileoverview Unit tests for error classes
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  NostrWebError,
  DNSError,
  RelayError,
  ManifestError,
  TimeoutError,
  ValidationError,
  SRIError,
  normalizeError,
} from "../src/shared/errors.js";

describe("NostrWebError", () => {
  it("should create error with message and code", () => {
    const err = new NostrWebError("Test error", "TEST_CODE");
    assert.strictEqual(err.message, "Test error");
    assert.strictEqual(err.code, "TEST_CODE");
    assert.strictEqual(err.name, "NostrWebError");
  });

  it("should include timestamp", () => {
    const before = Date.now();
    const err = new NostrWebError("Test");
    const after = Date.now();
    assert.ok(err.timestamp >= before && err.timestamp <= after);
  });

  it("should include details object", () => {
    const details = { foo: "bar", baz: 123 };
    const err = new NostrWebError("Test", "CODE", details);
    assert.deepStrictEqual(err.details, details);
  });

  it("should serialize to JSON", () => {
    const err = new NostrWebError("Test message", "TEST_CODE", {
      key: "value",
    });
    const json = err.toJSON();
    assert.strictEqual(json.name, "NostrWebError");
    assert.strictEqual(json.message, "Test message");
    assert.strictEqual(json.code, "TEST_CODE");
    assert.deepStrictEqual(json.details, { key: "value" });
    assert.ok(json.timestamp);
    assert.ok(json.stack);
  });

  it("should be instance of Error", () => {
    const err = new NostrWebError("Test");
    assert.ok(err instanceof Error);
  });
});

describe("DNSError", () => {
  it("should create DNS error with host", () => {
    const err = new DNSError("example.com");
    assert.strictEqual(err.name, "DNSError");
    assert.strictEqual(err.code, "DNS_ERROR");
    assert.strictEqual(err.details.host, "example.com");
  });

  it("should include original error if provided", () => {
    const originalErr = new Error("Network failure");
    const err = new DNSError("example.com", originalErr);
    assert.strictEqual(err.details.originalError, "Network failure");
  });

  it("should be instance of NostrWebError", () => {
    const err = new DNSError("example.com");
    assert.ok(err instanceof NostrWebError);
  });
});

describe("RelayError", () => {
  it("should create relay error with relay list", () => {
    const relays = ["wss://relay1.com", "wss://relay2.com"];
    const err = new RelayError(relays);
    assert.strictEqual(err.name, "RelayError");
    assert.strictEqual(err.code, "RELAY_ERROR");
    assert.deepStrictEqual(err.details.relays, relays);
  });

  it("should include original error", () => {
    const originalErr = new Error("Connection timeout");
    const err = new RelayError(["wss://relay.com"], originalErr);
    assert.strictEqual(err.details.originalError, "Connection timeout");
  });
});

describe("ManifestError", () => {
  it("should create manifest error with route", () => {
    const err = new ManifestError("/about");
    assert.strictEqual(err.name, "ManifestError");
    assert.strictEqual(err.code, "MANIFEST_ERROR");
    assert.strictEqual(err.details.route, "/about");
  });

  it("should include original error", () => {
    const originalErr = new Error("Not found");
    const err = new ManifestError("/about", originalErr);
    assert.strictEqual(err.details.originalError, "Not found");
  });
});

describe("TimeoutError", () => {
  it("should create timeout error with operation and timeout", () => {
    const err = new TimeoutError("fetchAssets", 5000);
    assert.strictEqual(err.name, "TimeoutError");
    assert.strictEqual(err.code, "TIMEOUT_ERROR");
    assert.strictEqual(err.details.operation, "fetchAssets");
    assert.strictEqual(err.details.timeout, 5000);
  });
});

describe("ValidationError", () => {
  it("should create validation error with field and value", () => {
    const err = new ValidationError("url", "invalid", "Invalid URL format");
    assert.strictEqual(err.name, "ValidationError");
    assert.strictEqual(err.code, "VALIDATION_ERROR");
    assert.strictEqual(err.details.field, "url");
    assert.strictEqual(err.details.value, "invalid");
    assert.strictEqual(err.message, "Invalid URL format");
  });

  it("should use default message if not provided", () => {
    const err = new ValidationError("url", "invalid");
    assert.ok(err.message);
  });
});

describe("SRIError", () => {
  it("should create SRI error with event ID and hashes", () => {
    const eventId = "abc123";
    const expected = "hash1";
    const actual = "hash2";
    const err = new SRIError(eventId, expected, actual);
    assert.strictEqual(err.name, "SRIError");
    assert.strictEqual(err.code, "SRI_ERROR");
    assert.strictEqual(err.details.eventId, eventId);
    assert.strictEqual(err.details.expected, expected);
    assert.strictEqual(err.details.actual, actual);
  });
});

describe("normalizeError", () => {
  it("should return NostrWebError as-is", () => {
    const err = new NostrWebError("Test", "CODE");
    const normalized = normalizeError(err);
    assert.strictEqual(normalized, err);
  });

  it("should convert standard Error to NostrWebError", () => {
    const err = new Error("Standard error");
    const normalized = normalizeError(err);
    assert.ok(normalized instanceof NostrWebError);
    assert.strictEqual(normalized.message, "Standard error");
    assert.strictEqual(normalized.code, "INTERNAL_ERROR");
    assert.strictEqual(normalized.details.originalError, "Standard error");
  });

  it("should convert string to NostrWebError", () => {
    const normalized = normalizeError("Error string");
    assert.ok(normalized instanceof NostrWebError);
    assert.strictEqual(normalized.message, "Error string");
    assert.strictEqual(normalized.code, "UNKNOWN_ERROR");
  });

  it("should preserve DNS errors", () => {
    const err = new DNSError("example.com");
    const normalized = normalizeError(err);
    assert.ok(normalized instanceof DNSError);
    assert.strictEqual(normalized.code, "DNS_ERROR");
  });

  it("should handle null/undefined", () => {
    const normalizedNull = normalizeError(null);
    const normalizedUndef = normalizeError(undefined);
    assert.ok(normalizedNull instanceof NostrWebError);
    assert.ok(normalizedUndef instanceof NostrWebError);
  });
});
