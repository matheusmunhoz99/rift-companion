package br.com.workscanner.riftcompanion;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Baixa o APK novo e abre o instalador do Android. Sem loja: o app se atualiza sozinho. */
@CapacitorPlugin(name = "RiftUpdater")
public class RiftUpdaterPlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo pkg = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pkg.getLongVersionCode() : pkg.versionCode;
            JSObject result = new JSObject();
            result.put("versionCode", code);
            result.put("versionName", pkg.versionName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Não foi possível ler a versão instalada.");
        }
    }

    @PluginMethod
    public void install(final PluginCall call) {
        final String url = call.getString("url", "");
        if (!url.startsWith("https://")) {
            call.reject("Link de atualização inválido.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            // Android 8+ exige a permissão de instalar apps desconhecidos; abre a tela se faltar.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                call.reject("Permita instalar atualizações do Rift Companion e toque em Atualizar de novo.");
                return;
            }
            new Thread(() -> download(call, url)).start();
        });
    }

    private void download(PluginCall call, String url) {
        try {
            File apk = new File(getContext().getCacheDir(), "rift-update.apk");
            if (apk.exists()) apk.delete();
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(60000);
            conn.connect();
            if (conn.getResponseCode() / 100 != 2) {
                call.reject("A atualização não pôde ser baixada (" + conn.getResponseCode() + ").");
                return;
            }
            long total = conn.getContentLengthLong();
            try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                byte[] buffer = new byte[64 * 1024];
                long done = 0;
                int read;
                long lastNotify = 0;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    done += read;
                    long now = System.currentTimeMillis();
                    if (total > 0 && now - lastNotify > 150) {
                        lastNotify = now;
                        JSObject progress = new JSObject();
                        progress.put("progress", (double) done / total);
                        notifyListeners("progress", progress);
                    }
                }
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Falha ao baixar a atualização. Tente de novo.");
        }
    }
}
