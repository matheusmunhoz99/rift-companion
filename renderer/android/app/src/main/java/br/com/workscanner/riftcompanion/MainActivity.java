package br.com.workscanner.riftcompanion;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(RiftCredentialsPlugin.class);
        registerPlugin(RiftUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
