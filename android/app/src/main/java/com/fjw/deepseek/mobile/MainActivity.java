package com.fjw.deepseek.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(NativeCredentialsPlugin.class);
        super.onCreate(state);
    }
}
