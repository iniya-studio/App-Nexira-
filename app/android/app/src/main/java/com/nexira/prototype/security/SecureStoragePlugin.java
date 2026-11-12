package com.nexira.prototype.security;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "NexiraSecureStorage")
public class SecureStoragePlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "com.nexira.prototype.session.v1";
    private static final String PREFS = "nexira_secure_session_v1";
    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, KEYSTORE
        );
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    private String encrypt(String plainText) throws Exception {
        byte[] iv = new byte[IV_LENGTH];
        new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(TAG_LENGTH_BITS, iv));
        byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
        ByteBuffer buffer = ByteBuffer.allocate(iv.length + encrypted.length);
        buffer.put(iv);
        buffer.put(encrypted);
        return Base64.encodeToString(buffer.array(), Base64.NO_WRAP);
    }

    private String decrypt(String encoded) throws Exception {
        byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
        if (packed.length <= IV_LENGTH + 16) throw new SecurityException("Invalid secure record.");
        ByteBuffer buffer = ByteBuffer.wrap(packed);
        byte[] iv = new byte[IV_LENGTH];
        buffer.get(iv);
        byte[] encrypted = new byte[buffer.remaining()];
        buffer.get(encrypted);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(TAG_LENGTH_BITS, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.trim().isEmpty()) { call.reject("A storage key is required."); return; }
        try {
            String record = getContext().getSharedPreferences(PREFS, 0).getString(key, null);
            JSObject result = new JSObject();
            result.put("value", record == null ? JSObject.NULL : decrypt(record));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Secure storage read failed.", "SECURE_STORAGE_READ_FAILED", error);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.trim().isEmpty() || value == null) {
            call.reject("A storage key and value are required."); return;
        }
        try {
            boolean saved = getContext().getSharedPreferences(PREFS, 0)
                .edit().putString(key, encrypt(value)).commit();
            if (!saved) throw new IllegalStateException("Secure record could not be committed.");
            call.resolve();
        } catch (Exception error) {
            call.reject("Secure storage write failed.", "SECURE_STORAGE_WRITE_FAILED", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.trim().isEmpty()) { call.reject("A storage key is required."); return; }
        try {
            boolean saved = getContext().getSharedPreferences(PREFS, 0).edit().remove(key).commit();
            if (!saved) throw new IllegalStateException("Secure record could not be removed.");
            call.resolve();
        } catch (Exception error) {
            call.reject("Secure storage removal failed.", "SECURE_STORAGE_REMOVE_FAILED", error);
        }
    }
}
