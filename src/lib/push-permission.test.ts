import { afterEach, describe, expect, it, vi } from "vitest";

import { initialPushUiState } from "./push-permission";

function stubNotification(permission: NotificationPermission | undefined) {
  if (permission === undefined) {
    // stubGlobal(..., undefined) still leaves the property defined (just
    // undefined-valued), which is not what an actually-unsupported browser
    // looks like -- there `"Notification" in window` is false. Delete it
    // outright to match that.
    // @ts-expect-error -- deliberately removing a global for the test
    delete window.Notification;
    return;
  }
  vi.stubGlobal("Notification", { permission });
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: {} });
  vi.stubGlobal("PushManager", class {});
}

describe("initialPushUiState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads 'subscribed' synchronously when permission is already granted", () => {
    // This is the whole point: an already-subscribed visitor must see "On"
    // on the very first paint, not after an async round trip flips it from
    // "off". Regression test for the flicker this exists to fix.
    stubNotification("granted");
    expect(initialPushUiState()).toBe("subscribed");
  });

  it("reads 'blocked' when permission was denied", () => {
    stubNotification("denied");
    expect(initialPushUiState()).toBe("blocked");
  });

  it("reads 'idle' when permission has never been asked", () => {
    stubNotification("default");
    expect(initialPushUiState()).toBe("idle");
  });

  it("reads 'idle' when Notification doesn't exist on window", () => {
    stubNotification(undefined);
    expect(initialPushUiState()).toBe("idle");
  });
});
