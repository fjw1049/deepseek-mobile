import { Capacitor, registerPlugin } from "@capacitor/core";
import { runtimeBase } from "./protocol";
type Credential = { url: string; token: string; deviceId: string };
const native = registerPlugin<{ save(options: {value: string}): Promise<void>; load(): Promise<{value: string | null}>; clear(): Promise<void> }>("NativeCredentials");
export async function saveDeviceCredential(value: Credential) {
  if (!Capacitor.isNativePlatform()) return;
  if (!value.token.startsWith("dsd_")) throw new Error("仅配对设备令牌可安全保存");
  await native.save({value: JSON.stringify({...value, url:runtimeBase(value.url)})});
}
export async function loadDeviceCredential(): Promise<Credential | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const {value} = await native.load();
  if (!value) return null;
  const saved = JSON.parse(value) as Partial<Credential>;
  if (typeof saved.url !== "string" || typeof saved.token !== "string" || !saved.token.startsWith("dsd_") || typeof saved.deviceId !== "string") throw new Error("保存的设备凭据无效，请重新配对");
  return {url:runtimeBase(saved.url),token:saved.token,deviceId:saved.deviceId};
}
export async function clearDeviceCredential() {
  if (Capacitor.isNativePlatform()) await native.clear();
}
