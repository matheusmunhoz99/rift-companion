package br.com.workscanner.riftcompanion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/**
 * Avisa no celular, com o app fechado, quando a partida entra na tela de carregamento e
 * quando ela começa de fato (o relógio do jogo passa a andar). Consulta só a fase da
 * partida no servidor, mais rápido perto do jogo e devagar no resto do tempo.
 */
public class GameWatchService extends Service {
    static final String WATCH_CHANNEL = "rift.watch";
    static final String GAME_CHANNEL = "rift.game";
    private static final int WATCH_ID = 41;
    private static final int GAME_ID = 42;
    private static final String PHASE_URL = "https://rift-api.workscanner.com.br/v1/mobile/phase";
    /** Perto da partida (fila, seleção, carregamento) e no resto do tempo. */
    private static final long FAST_MS = 4_000, SLOW_MS = 20_000;

    private volatile boolean running;
    private Thread worker;
    /** O que já foi avisado na partida atual: carregando, começou. */
    private boolean loadingNotified, startedNotified;

    static void start(Context context) {
        Intent intent = new Intent(context, GameWatchService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, GameWatchService.class));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        createChannels(this);
        Notification watch = new Notification.Builder(this, WATCH_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_rift)
            .setContentTitle("Rift Companion")
            .setContentText("De olho na partida: avisa quando carregar e quando começar.")
            .setContentIntent(openApp())
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(WATCH_ID, watch, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(WATCH_ID, watch);
        if (!running) {
            running = true;
            worker = new Thread(this::loop, "rift-game-watch");
            worker.start();
        }
        // Reiniciado pelo sistema depois de fechado por falta de memória.
        return START_STICKY;
    }

    @Override public void onDestroy() {
        running = false;
        if (worker != null) worker.interrupt();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void loop() {
        while (running) {
            long wait = SLOW_MS;
            try {
                String token = RiftCredentialsPlugin.readToken(this);
                // Sem vínculo (desvinculou no app): não há o que vigiar.
                if (token == null) { stopSelf(); return; }
                JSONObject state = fetchPhase(token);
                String phase = state.optBoolean("online") ? state.optString("phase", "") : "";
                long gameTime = state.isNull("gameTime") ? -1 : state.optLong("gameTime", -1);
                wait = onPhase(phase, gameTime);
            } catch (Exception e) {
                // Sem internet ou servidor fora: tenta de novo mais tarde.
            }
            try { Thread.sleep(wait); } catch (InterruptedException e) { return; }
        }
    }

    /** Decide os avisos pela fase da partida e devolve quanto esperar até a próxima consulta. */
    private long onPhase(String phase, long gameTime) {
        boolean inGame = phase.equals("GameStart") || phase.equals("InProgress") || phase.equals("Reconnect");
        if (!inGame) {
            loadingNotified = false;
            startedNotified = false;
            boolean near = phase.equals("Matchmaking") || phase.equals("ReadyCheck") || phase.equals("ChampSelect");
            return near ? FAST_MS : SLOW_MS;
        }
        if (!loadingNotified && !startedNotified && gameTime <= 0) {
            loadingNotified = true;
            notifyGame("Partida carregando", "Tela de carregamento: a partida já vai começar.");
        }
        if (!startedNotified && gameTime > 0) {
            startedNotified = true;
            notifyGame("A partida começou!", "O jogo já está rolando. Boa partida!");
        }
        // Depois de avisar o começo, a partida segue sem novos avisos: consulta devagar.
        return startedNotified ? SLOW_MS : FAST_MS;
    }

    private JSONObject fetchPhase(String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(PHASE_URL).openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(15_000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        try {
            if (connection.getResponseCode() != 200) throw new Exception("HTTP " + connection.getResponseCode());
            try (InputStream input = connection.getInputStream()) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[1024];
                for (int read; (read = input.read(buffer)) != -1 && output.size() < 4096; ) output.write(buffer, 0, read);
                return new JSONObject(output.toString("UTF-8"));
            }
        } finally {
            connection.disconnect();
        }
    }

    private void notifyGame(String title, String text) {
        Notification notification = new Notification.Builder(this, GAME_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_rift)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_EVENT)
            .build();
        getSystemService(NotificationManager.class).notify(GAME_ID, notification);
    }

    private PendingIntent openApp() {
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void createChannels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel watch = new NotificationChannel(WATCH_CHANNEL, "Vigia da partida", NotificationManager.IMPORTANCE_MIN);
        watch.setDescription("Fica ativa enquanto o celular espera a partida começar.");
        watch.setShowBadge(false);
        NotificationChannel game = new NotificationChannel(GAME_CHANNEL, "Partida carregando e começando", NotificationManager.IMPORTANCE_HIGH);
        game.setDescription("Avisa quando a partida entra no carregamento e quando começa.");
        manager.createNotificationChannel(watch);
        manager.createNotificationChannel(game);
    }
}
