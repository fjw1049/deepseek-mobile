package com.fjw.deepseek.mobile;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeCredentials")
public class NativeCredentialsPlugin extends Plugin {
    private static final String ALIAS = "deepseek.mobile.paired-device";
    private AtomicFile file(PluginCall call) { return new AtomicFile(new File(getContext().getNoBackupFilesDir(), Boolean.TRUE.equals(call.getBoolean("account", false)) ? "account-session.enc" : "paired-device.enc")); }
    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        if (!create) throw new IllegalStateException("Device key is unavailable; pair again");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    @PluginMethod public void save(PluginCall call) {
        try {
            String value = call.getString("value");
            boolean account = Boolean.TRUE.equals(call.getBoolean("account", false));
            if (value == null || value.getBytes(StandardCharsets.UTF_8).length > (account ? 65536 : 8192)) throw new IllegalArgumentException("Invalid credential size");
            JSONObject record = new JSONObject(value);
            if (account) {
                JSONObject session = new JSONObject(record.getString("value"));
                if (!"supabase-session".equals(record.getString("kind")) || record.getString("key").isEmpty() || session.getString("access_token").isEmpty() || session.getString("refresh_token").isEmpty()) throw new IllegalArgumentException("Invalid account session");
            } else if (!record.getString("token").startsWith("dsd_")) throw new IllegalArgumentException("Only paired-device credentials may be saved");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(true));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            AtomicFile target = file(call); FileOutputStream stream = target.startWrite();
            try { stream.write(cipher.getIV()); stream.write(encrypted); target.finishWrite(stream); }
            catch (Exception error) { target.failWrite(stream); throw error; }
            call.resolve();
        } catch (Exception error) { call.reject("Secure credential save failed", error); }
    }
    @PluginMethod public void load(PluginCall call) {
        try {
            AtomicFile target = file(call); JSObject result = new JSObject();
            if (!target.getBaseFile().exists()) { result.put("value", JSONObject.NULL); call.resolve(result); return; }
            byte[] stored = target.readFully();
            if (stored.length < 28 || stored.length > 65564) throw new IllegalStateException("Invalid credential record");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, Arrays.copyOfRange(stored, 0, 12)));
            String value = new String(cipher.doFinal(Arrays.copyOfRange(stored, 12, stored.length)), StandardCharsets.UTF_8);
            result.put("value", value); call.resolve(result);
        } catch (Exception error) { call.reject("Secure credentials unavailable; pair again", error); }
    }
    @PluginMethod public void clear(PluginCall call) { file(call).delete(); call.resolve(); }
}
