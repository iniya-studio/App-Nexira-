package com.nexira.prototype.auth;

import android.os.CancellationSignal;
import android.text.TextUtils;

import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "NexiraGoogleAuth")
public class GoogleAuthPlugin extends Plugin {
    private CancellationSignal activeCancellation;

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        String nonce = call.getString("nonce");
        if (TextUtils.isEmpty(serverClientId)
                || !serverClientId.endsWith(".apps.googleusercontent.com")
                || TextUtils.isEmpty(nonce)
                || nonce.length() < 32
                || nonce.length() > 256) {
            call.reject("Google sign-in is not configured correctly.", "GOOGLE_CONFIGURATION_ERROR");
            return;
        }

        final CredentialManager manager = CredentialManager.create(getContext());
        final GetSignInWithGoogleOption googleOption;
        try {
            googleOption = new GetSignInWithGoogleOption.Builder(serverClientId)
                    .setNonce(nonce)
                    .build();
        } catch (Exception error) {
            call.reject("Unable to prepare Google sign-in.", "GOOGLE_CONFIGURATION_ERROR", error);
            return;
        }

        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(googleOption)
                .build();
        activeCancellation = new CancellationSignal();
        Executor executor = ContextCompat.getMainExecutor(getContext());

        manager.getCredentialAsync(
                getActivity(),
                request,
                activeCancellation,
                executor,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        Credential credential = response.getCredential();
                        if (!(credential instanceof CustomCredential)
                                || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                                        .equals(credential.getType())) {
                            call.reject("Google did not return a supported identity credential.",
                                    "GOOGLE_CREDENTIAL_UNEXPECTED");
                            return;
                        }
                        try {
                            GoogleIdTokenCredential googleCredential =
                                    GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                            String idToken = googleCredential.getIdToken();
                            if (TextUtils.isEmpty(idToken)) {
                                call.reject("Google returned an empty identity token.", "GOOGLE_TOKEN_EMPTY");
                                return;
                            }
                            JSObject result = new JSObject();
                            result.put("idToken", idToken);
                            call.resolve(result);
                        } catch (Exception error) {
                            call.reject("Google identity response could not be read.",
                                    "GOOGLE_CREDENTIAL_INVALID", error);
                        } finally {
                            activeCancellation = null;
                        }
                    }

                    @Override
                    public void onError(GetCredentialException error) {
                        activeCancellation = null;
                        String code = error.getClass().getSimpleName();
                        if (code.contains("Cancellation")) {
                            call.reject("Google sign-in was cancelled.", "GOOGLE_SIGN_IN_CANCELLED");
                        } else {
                            call.reject("Google sign-in is currently unavailable.", "GOOGLE_SIGN_IN_FAILED", error);
                        }
                    }
                });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        if (activeCancellation != null) activeCancellation.cancel();
        call.resolve();
    }
}
