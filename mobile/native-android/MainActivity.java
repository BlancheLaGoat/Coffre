package com.blanchelagoat.coffre;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Module maison : lecture du texte des pochettes (ML Kit)
        registerPlugin(TextReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
