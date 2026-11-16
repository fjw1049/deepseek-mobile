import Capacitor
import Security

@objc(NativeCredentialsPlugin)
public class NativeCredentialsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCredentialsPlugin"
    public let jsName = "NativeCredentials"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)]
    private func query(_ call: CAPPluginCall) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.fjw.deepseek.mobile.credentials", kSecAttrAccount as String: call.getBool("account", false) ? "account-session" : "paired-device"] }
    @objc func save(_ call: CAPPluginCall) {
        let account = call.getBool("account", false)
        guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= (account ? 65536 : 8192),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { call.reject("Invalid credential record"); return }
        if account {
            guard object["kind"] == "supabase-session", let key = object["key"], !key.isEmpty,
                  let payload = object["value"]?.data(using: .utf8),
                  let session = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
                  let access = session["access_token"] as? String, !access.isEmpty,
                  let refresh = session["refresh_token"] as? String, !refresh.isEmpty else { call.reject("Invalid account session"); return }
        } else if object["token"]?.hasPrefix("dsd_") != true { call.reject("Only paired-device credentials may be saved"); return }
        let query = query(call)
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, value in value } as CFDictionary, nil) }
        guard status == errSecSuccess else { call.reject("Keychain save failed (\(status))"); return }
        call.resolve()
    }
    @objc func load(_ call: CAPPluginCall) {
        var item: CFTypeRef?
        var request = query(call)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) else { call.reject("Keychain is unavailable"); return }
        call.resolve(["value": value])
    }
    @objc func clear(_ call: CAPPluginCall) {
        let status = SecItemDelete(query(call) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { call.reject("Keychain delete failed"); return }
        call.resolve()
    }
}
class MobileBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(NativeCredentialsPlugin()) }
}
