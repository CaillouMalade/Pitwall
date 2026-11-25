package io.github.arthurbrht.pitwall;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // The desktop sizes, scaled only by the font size chosen in Android.
    private static final int PHONE_TEXT_PERCENT = 100;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PitwallShellPlugin.class);
        super.onCreate(savedInstanceState);
        // Also follows the font size chosen in Android's display settings.
        float systemScale = getResources().getConfiguration().fontScale;
        getBridge().getWebView().getSettings().setTextZoom(Math.round(PHONE_TEXT_PERCENT * systemScale));
    }
}
