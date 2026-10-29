package br.com.workscanner.riftcompanion;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Liga e desliga o aviso de partida em segundo plano (GameWatchService). */
@CapacitorPlugin(
    name = "RiftGameWatch",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class RiftGameWatchPlugin extends Plugin {
    @PluginMethod public void start(PluginCall call) {
        // Android 13+: sem a permissão, o sistema esconde as notificações.
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        startService(call);
    }

    @PermissionCallback private void afterPermission(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Sem permissão de notificação: libere em Configurações do Android › Apps › Rift Companion.");
            return;
        }
        startService(call);
    }

    private void startService(PluginCall call) {
        try {
            GameWatchService.start(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível ligar o aviso de partida.");
        }
    }

    @PluginMethod public void stop(PluginCall call) {
        GameWatchService.stop(getContext());
        call.resolve();
    }

    @PluginMethod public void permission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }
}
