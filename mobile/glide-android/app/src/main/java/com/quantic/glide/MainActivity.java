package com.quantic.glide;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.SafeBrowsingResponse;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;


public final class MainActivity extends Activity {
    private WebView webView;
    private EditText address;

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setAllCaps(false);
        b.setMinWidth(dp(42));
        return b;
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(7, 10, 18));
        getWindow().setNavigationBarColor(Color.rgb(7, 10, 18));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(7, 10, 18));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(6), dp(4), dp(6), dp(4));

        Button back = button("‹");
        Button reload = button("↻");
        Button aura = button("✦");
        aura.setContentDescription("Ouvrir AURA 2.0");
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextColor(Color.WHITE);
        address.setHintTextColor(Color.rgb(140, 150, 170));
        address.setHint("Rechercher ou saisir une adresse");
        address.setBackgroundColor(Color.rgb(16, 22, 36));
        address.setPadding(dp(12), 0, dp(12), 0);
        LinearLayout.LayoutParams addressLp = new LinearLayout.LayoutParams(0, dp(46), 1f);
        addressLp.setMargins(dp(4), 0, dp(4), 0);

        Button go = button("→");
        bar.addView(back, new LinearLayout.LayoutParams(dp(46), dp(46)));
        bar.addView(reload, new LinearLayout.LayoutParams(dp(46), dp(46)));
        bar.addView(aura, new LinearLayout.LayoutParams(dp(46), dp(46)));
        bar.addView(address, addressLp);
        bar.addView(go, new LinearLayout.LayoutParams(dp(46), dp(46)));

        TextView badge = new TextView(this);
        badge.setText("Quantic Glide · Android beta · local-first");
        badge.setTextColor(Color.rgb(170, 180, 205));
        badge.setTextSize(11);
        badge.setGravity(Gravity.CENTER);
        badge.setPadding(0, dp(2), 0, dp(6));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 10, 18));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setGeolocationEnabled(false);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(true);
        webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            webView.getSettings().setSafeBrowsingEnabled(true);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                return !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                address.setText(url);
            }

            @Override
            public void onSafeBrowsingHit(WebView view, WebResourceRequest request, int threatType, SafeBrowsingResponse callback) {
                if (android.os.Build.VERSION.SDK_INT >= 27) callback.backToSafety(true);
            }
        });

        View.OnClickListener navigate = v -> loadInput(address.getText().toString());
        go.setOnClickListener(navigate);
        address.setOnEditorActionListener((v, actionId, event) -> {
            loadInput(address.getText().toString());
            return true;
        });
        back.setOnClickListener(v -> {
            if (webView.canGoBack()) webView.goBack();
        });
        reload.setOnClickListener(v -> webView.reload());
        aura.setOnClickListener(v -> webView.loadUrl("https://antiquewhite-dolphin-780448.hostingersite.com/"));

        root.addView(bar);
        root.addView(badge, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(28)));
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        if (state == null) loadInput("https://duckduckgo.com/");
    }

    private void loadInput(String raw) {
        String input = raw == null ? "" : raw.trim();
        if (input.isEmpty()) return;
        if (input.matches("(?i)^https?://.+")) {
            webView.loadUrl(input);
            return;
        }
        if (input.matches("^[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/.*)?$")) {
            webView.loadUrl("https://" + input);
            return;
        }
        String encoded = Uri.encode(input);
        webView.loadUrl("https://duckduckgo.com/?q=" + encoded);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
