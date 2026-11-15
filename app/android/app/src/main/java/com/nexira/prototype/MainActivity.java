package com.nexira.prototype;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.nexira.prototype.security.SecureStoragePlugin;
import com.nexira.prototype.auth.GoogleAuthPlugin;
import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(SecureStoragePlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
