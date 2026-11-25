package io.github.arthurbrht.pitwall;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Matches the window behind the system bars to the appearance chosen inside
 * Pitwall, which can differ from the device setting. WebViews before 140 show
 * this window instead of the page in the status and navigation bar areas.
 */
@CapacitorPlugin(name = "PitwallShell")
public class PitwallShellPlugin extends Plugin {

    @PluginMethod
    public void setBackground(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", ""));
        } catch (IllegalArgumentException | StringIndexOutOfBoundsException error) {
            call.reject("A #rrggbb colour is required.");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(color);
            call.resolve();
        });
    }
}
