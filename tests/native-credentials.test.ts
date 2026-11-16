import { beforeEach, expect, test, vi } from "vitest";
const bridge = vi.hoisted(() => ({ native: false, save: vi.fn(), load: vi.fn(), clear: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => bridge.native }, registerPlugin: () => bridge }));
import { saveDeviceCredential, loadDeviceCredential, clearDeviceCredential } from "../src/native-credentials";
beforeEach(() => { vi.clearAllMocks(); bridge.native = false; });
test("web never persists or retrieves a device token", async () => {
  await saveDeviceCredential({url:"https://example.invalid",token:"dsd_test",deviceId:"one"});
  expect(await loadDeviceCredential()).toBeNull(); await clearDeviceCredential();
  expect(bridge.save).not.toHaveBeenCalled(); expect(bridge.load).not.toHaveBeenCalled(); expect(bridge.clear).not.toHaveBeenCalled();
});
test("native stores only paired-device credentials and validates saved URLs", async () => {
  bridge.native = true;
  await expect(saveDeviceCredential({url:"https://example.invalid",token:"admin-secret",deviceId:"one"})).rejects.toThrow();
  expect(bridge.save).not.toHaveBeenCalled();
  await saveDeviceCredential({url:"https://example.invalid",token:"dsd_test",deviceId:"one"});
  expect(JSON.parse(bridge.save.mock.calls[0][0].value).token).toBe("dsd_test");
  bridge.load.mockResolvedValue({value:JSON.stringify({url:"https://user:password@example.invalid",token:"dsd_test",deviceId:"one"})});
  await expect(loadDeviceCredential()).rejects.toThrow();
  await clearDeviceCredential(); expect(bridge.clear).toHaveBeenCalledOnce();
});
