export function configureAndroidMainActivity(source, bundleIdentifier) {
  if (!/^package\s+[^;]+;/m.test(source)) {
    throw new Error('No se encontró package de MainActivity. Regenera el proyecto nativo con Capacitor.');
  }
  if (!/public\s+class\s+MainActivity\s+extends\s+BridgeActivity/.test(source)) {
    throw new Error('MainActivity no extiende BridgeActivity. No se sobrescribe una actividad nativa desconocida.');
  }

  return `package ${bundleIdentifier};

import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

import org.json.JSONException;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        config = CapConfig.loadDefault(this);
        try {
            // Android 14 and older resize the activity through adjustResize. On
            // those versions, SystemBars IME padding reserves the keyboard height
            // a second time (Capacitor #8412/#8525), producing the large grey gap.
            String insetsHandling = Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM
                ? "disable"
                : "css";
            config.getPluginConfiguration("SystemBars")
                .getConfigJSON()
                .put("insetsHandling", insetsHandling);
        } catch (JSONException exception) {
            throw new IllegalStateException("Unable to configure Android window insets", exception);
        }
        super.onCreate(savedInstanceState);
    }
}
`;
}
