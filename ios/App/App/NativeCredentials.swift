import Capacitor
import Security

@objc(NativeCredentialsPlugin)
public class NativeCredentialsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCredentialsPlugin"
    public let jsName = "NativeCredentials"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)]
    private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.fjw.deepseek.mobile.credentials", kSecAttrAccount as String: "paired-device"] }
    @objc func save(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= 8192,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              object["token"]?.hasPrefix("dsd_") == true else { call.reject("Only paired-device credentials may be saved"); return }
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, value in value } as CFDictionary, nil) }
        guard status == errSecSuccess else { call.reject("Keychain save failed (\(status))"); return }
        call.resolve()
    }
    @objc func load(_ call: CAPPluginCall) {
        var item: CFTypeRef?
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) else { call.reject("Keychain is unavailable"); return }
        call.resolve(["value": value])
    }
    @objc func clear(_ call: CAPPluginCall) {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { call.reject("Keychain delete failed"); return }
        call.resolve()
    }
}
class MobileBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(NativeCredentialsPlugin()) }
}
