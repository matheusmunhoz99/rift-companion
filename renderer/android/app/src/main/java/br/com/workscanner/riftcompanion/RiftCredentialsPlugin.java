package br.com.workscanner.riftcompanion;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Pairing credential encrypted by a non-exportable Android Keystore key. */
@CapacitorPlugin(name = "RiftCredentials")
public class RiftCredentialsPlugin extends Plugin {
    private static final String ALIAS = "rift.mobile.v1";
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    @PluginMethod public void set(PluginCall call) {
        try {
            String token = call.getString("token", "");
            if (!token.matches("[a-f0-9]{64}")) { call.reject("Vínculo inválido."); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String encrypted = Base64.encodeToString(cipher.doFinal(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
            boolean saved = getContext().getSharedPreferences(ALIAS, Context.MODE_PRIVATE).edit()
                .putString("value", encrypted).putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).commit();
            if (!saved) throw new Exception();
            call.resolve();
        } catch (Exception e) { call.reject("Não foi possível guardar o vínculo seguro."); }
    }
    @PluginMethod public void get(PluginCall call) {
        try {
            JSObject result = new JSObject();
            String token = readToken(getContext());
            if (token != null) result.put("token", token);
            call.resolve(result);
        } catch (Exception e) { call.reject("Vínculo indisponível. Conecte novamente."); }
    }

    /** Token do vínculo (null sem vínculo); também usado pelo aviso de partida em segundo plano. */
    static String readToken(Context context) throws Exception {
        var prefs = context.getSharedPreferences(ALIAS, Context.MODE_PRIVATE);
        String value = prefs.getString("value", null);
        if (value == null) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8);
    }
    @PluginMethod public void remove(PluginCall call) {
        getContext().getSharedPreferences(ALIAS, Context.MODE_PRIVATE).edit().clear().commit();
        call.resolve();
    }
}
