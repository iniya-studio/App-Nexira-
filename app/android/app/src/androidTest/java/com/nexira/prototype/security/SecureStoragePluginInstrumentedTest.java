package com.nexira.prototype.security;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.JSObject;
import com.getcapacitor.MessageHandler;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginResult;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;

@RunWith(AndroidJUnit4.class)
public class SecureStoragePluginInstrumentedTest {
    private static final String PREFS = "nexira_secure_session_v1";
    private static final String SESSION_KEY = "nexira.session.state.v1";
    private static final String SESSION_VALUE =
        "{\"refreshToken\":\"abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\","
        + "\"pendingRefreshAttempt\":null,\"pendingGuestConversion\":null}";

    private Context context;

    private static final class ContextBoundPlugin extends SecureStoragePlugin {
        private final Context testContext;

        ContextBoundPlugin(Context context) {
            this.testContext = context;
        }

        @Override
        public Context getContext() {
            return testContext;
        }
    }

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test
    public void encryptedRecordSurvivesPluginRecreationAndDecryptsWithKeystoreKey() throws Exception {
        MessageHandler writeHandler = mock(MessageHandler.class);
        ContextBoundPlugin firstInstance = new ContextBoundPlugin(context);
        PluginCall writeCall = new PluginCall(
            writeHandler, "NexiraSecureStorage", PluginCall.CALLBACK_ID_DANGLING,
            "set", new JSObject().put("key", SESSION_KEY).put("value", SESSION_VALUE)
        );

        firstInstance.set(writeCall);
        verify(writeHandler).sendResponseMessage(eq(writeCall), isNull(), isNull());
        verifyNoMoreInteractions(writeHandler);

        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String ciphertext = preferences.getString(SESSION_KEY, null);
        assertNotNull("Encrypted session record must be persisted", ciphertext);
        assertFalse("SharedPreferences must not contain the plaintext refresh-token record",
            ciphertext.contains(SESSION_VALUE));
        assertFalse("SharedPreferences must not contain the refresh token",
            ciphertext.contains("abcdefghijklmnopqrstuvwxyz_"));
        assertNotNull("Stored value must be valid Base64 ciphertext",
            Base64.decode(ciphertext, Base64.NO_WRAP));
        assertEquals("IV plus GCM tag and encrypted payload must be present",
            true, Base64.decode(ciphertext, Base64.NO_WRAP).length > 12 + 16);

        // A fresh plugin instance has no in-memory state; successful decryption
        // therefore proves persistence through Android Keystore + SharedPreferences.
        MessageHandler readHandler = mock(MessageHandler.class);
        ContextBoundPlugin recreatedInstance = new ContextBoundPlugin(context);
        PluginCall readCall = new PluginCall(
            readHandler, "NexiraSecureStorage", PluginCall.CALLBACK_ID_DANGLING,
            "get", new JSObject().put("key", SESSION_KEY)
        );

        recreatedInstance.get(readCall);

        ArgumentCaptor<PluginResult> resultCaptor = ArgumentCaptor.forClass(PluginResult.class);
        verify(readHandler).sendResponseMessage(eq(readCall), resultCaptor.capture(), isNull());
        verifyNoMoreInteractions(readHandler);
        JSObject decoded = new JSObject(resultCaptor.getValue().toString());
        assertEquals(SESSION_VALUE, decoded.getString("value"));
    }
}
