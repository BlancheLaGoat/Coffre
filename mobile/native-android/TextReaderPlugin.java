package com.blanchelagoat.coffre;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Lecture du texte d'une photo (pochette de vinyle) avec ML Kit, directement sur le téléphone.
 * Appel depuis la page : Capacitor.Plugins.TextReader.read({ image: "<jpeg en base64>" })
 * Renvoie { text, lines: [{ text, x, y, w, h }] }.
 */
@CapacitorPlugin(name = "TextReader")
public class TextReaderPlugin extends Plugin {

    private TextRecognizer recognizer;

    @PluginMethod
    public void read(PluginCall call) {
        String b64 = call.getString("image");
        if (b64 == null || b64.isEmpty()) {
            call.reject("Image manquante");
            return;
        }
        Bitmap bmp;
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            bmp = null;
        }
        if (bmp == null) {
            call.reject("Image illisible");
            return;
        }
        if (recognizer == null) {
            recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        }
        recognizer.process(InputImage.fromBitmap(bmp, 0))
            .addOnSuccessListener(result -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock block : result.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        JSObject o = new JSObject();
                        o.put("text", line.getText());
                        Rect r = line.getBoundingBox();
                        if (r != null) {
                            o.put("x", r.left);
                            o.put("y", r.top);
                            o.put("w", r.width());
                            o.put("h", r.height());
                        }
                        lines.put(o);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("text", result.getText());
                ret.put("lines", lines);
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject("Lecture impossible : " + e.getMessage()));
    }
}
