package in.courtjudgments.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.GZIPInputStream;

/**
 * Court Judgments: a small viewer for public Indian court judgment datasets.
 * UI is local HTML/JS (assets/www). Data files are fetched through a local
 * proxy path (/data?u=...) so they can be cached on the phone and gunzipped.
 * Only the project's own data release and the public dataset buckets are allowed.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String[] ALLOWED = {
            "https://github.com/sunny1991-co/court-judgments-app/releases/download/",
            "https://indian-supreme-court-judgments.s3.amazonaws.com/",
            "https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/",
            "https://indian-high-court-judgments.s3.amazonaws.com/",
            "https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/",
    };
    private static final long CACHE_MS = 7L * 24 * 3600 * 1000;
    private WebView web;

    static boolean allowed(String url) {
        if (url == null) return false;
        for (String p : ALLOWED) if (url.startsWith(p)) return true;
        return false;
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost()) && "/data".equals(u.getPath())) {
                    return dataResponse(u.getQueryParameter("u"), "1".equals(u.getQueryParameter("fresh")));
                }
                return loader.shouldInterceptRequest(u);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u.toString());  // any other link opens outside the app
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Native");
        web.loadUrl("https://" + HOST + "/assets/www/index.html");
    }

    private WebResourceResponse dataResponse(String url, boolean fresh) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-store");
        try {
            if (!allowed(url)) throw new SecurityException("URL not allowed");
            File f = cached(url, fresh);
            InputStream in = new FileInputStream(f);
            if (url.endsWith(".gz")) in = new GZIPInputStream(in, 65536);
            return new WebResourceResponse("application/json", "utf-8", 200, "OK", headers, in);
        } catch (Exception e) {
            byte[] msg = ("{\"error\":\"" + e.getClass().getSimpleName() + "\"}").getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse("application/json", "utf-8", 502, "Bad Gateway", headers,
                    new ByteArrayInputStream(msg));
        }
    }

    /** Download once, keep for 7 days (or refresh when asked); stale copy if offline. */
    private File cached(String url, boolean fresh) throws Exception {
        File dir = new File(getFilesDir(), "data");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no dir");
        File f = new File(dir, sha1(url));
        boolean young = f.exists() && System.currentTimeMillis() - f.lastModified() < CACHE_MS;
        if (young && !fresh) return f;
        File tmp = new File(dir, f.getName() + ".part");
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            c.setRequestProperty("User-Agent", "CourtJudgmentsApp/1");
            int code = c.getResponseCode();
            if (code != 200) throw new IllegalStateException("HTTP " + code);
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            if (!tmp.renameTo(f)) throw new IllegalStateException("rename");
            return f;
        } catch (Exception e) {
            tmp.delete();
            if (f.exists()) return f;  // offline: use the older copy
            throw e;
        }
    }

    private static String sha1(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder b = new StringBuilder();
        for (byte x : d) b.append(String.format("%02x", x));
        return b.toString();
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "Is link ko kholne wala app nahi mila", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    class Bridge {
        @JavascriptInterface
        public void openPdf(String url) {
            if (!allowed(url)) return;
            runOnUiThread(() -> openExternal(url));
        }

        @JavascriptInterface
        public void download(String url, String name) {
            if (!allowed(url)) return;
            runOnUiThread(() -> {
                try {
                    String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                    if (!safe.toLowerCase().endsWith(".pdf")) safe += ".pdf";
                    DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
                            .setTitle(safe)
                            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Judgments/" + safe);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                    Toast.makeText(MainActivity.this, "Download shuru: Downloads/Judgments", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Download nahi hua", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Share"));
            });
        }

        @JavascriptInterface
        public void clearCache() {
            File dir = new File(getFilesDir(), "data");
            File[] files = dir.listFiles();
            if (files != null) for (File f : files) f.delete();
        }
    }
}
