package io.github.yyahz.umaseedsearcher;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.DisplayCutout;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebChromeClient;
import android.webkit.WebBackForwardList;
import android.webkit.WebHistoryItem;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String TOOL_URL = "https://game.bilibili.com/tool/pd";
    private static final String VERSION_SOURCE_URL = "https://raw.githubusercontent.com/yyahz/umamusume-seed-searcher-android/main/app/build.gradle";
    private static final String UPDATE_AUTHORITY = "io.github.yyahz.umaseedsearcher.updates";
    private static final long MAX_UPDATE_BYTES = 25L * 1024L * 1024L;
    private static final List<String> EXTENSION_SCRIPTS = Arrays.asList(
        "page-bridge.js",
        "ranking.js",
        "gold-skill-map.js",
        "traditional-name-map.js",
        "factor-recognizer.js",
        "request-guard.js",
        "content.js",
        "mobile-ui.js"
    );

    private WebView webView;
    private ProgressBar progressBar;
    private View startupPanel;
    private View errorPanel;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int readinessAttempts;
    private boolean searchInterfaceReady;
    private volatile boolean updateDownloadInProgress;
    private File pendingUpdateFile;
    private boolean awaitingInstallPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();
        buildInterface();
        configureWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(TOOL_URL);
        } else {
            WebBackForwardList restored = webView.restoreState(savedInstanceState);
            WebHistoryItem current = restored == null ? null : restored.getCurrentItem();
            Uri restoredUri = current == null ? null : Uri.parse(current.getUrl());
            if (restoredUri == null || (!isToolPage(restoredUri) && !isAuthenticationPage(restoredUri))) {
                webView.loadUrl(TOOL_URL);
            }
        }
    }

    private void buildInterface() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247, 248, 244));

        webView = new WebView(this);
        webView.setVisibility(View.INVISIBLE);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        );
        progressParams.gravity = Gravity.TOP;
        root.addView(progressBar, progressParams);

        LinearLayout startup = new LinearLayout(this);
        startup.setOrientation(LinearLayout.VERTICAL);
        startup.setGravity(Gravity.CENTER);
        startup.setPadding(dp(28), dp(28), dp(28), dp(28));
        startup.setBackgroundColor(Color.rgb(247, 248, 244));

        ImageView startupIcon = new ImageView(this);
        startupIcon.setImageResource(R.drawable.app_icon);
        startupIcon.setContentDescription(null);
        startup.addView(startupIcon, new LinearLayout.LayoutParams(dp(92), dp(92)));

        TextView startupTitle = new TextView(this);
        startupTitle.setText(R.string.startup_title);
        startupTitle.setTextColor(Color.rgb(7, 88, 52));
        startupTitle.setTextSize(24);
        startupTitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams startupTitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        startupTitleParams.topMargin = dp(18);
        startup.addView(startupTitle, startupTitleParams);

        TextView startupMessage = new TextView(this);
        startupMessage.setText(R.string.startup_message);
        startupMessage.setTextColor(Color.rgb(102, 114, 107));
        startupMessage.setTextSize(14);
        startupMessage.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams startupMessageParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        startupMessageParams.topMargin = dp(8);
        startup.addView(startupMessage, startupMessageParams);

        ProgressBar startupProgress = new ProgressBar(this);
        LinearLayout.LayoutParams startupProgressParams = new LinearLayout.LayoutParams(dp(44), dp(44));
        startupProgressParams.topMargin = dp(18);
        startup.addView(startupProgress, startupProgressParams);

        startupPanel = startup;
        root.addView(startup, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        LinearLayout error = new LinearLayout(this);
        error.setOrientation(LinearLayout.VERTICAL);
        error.setGravity(Gravity.CENTER);
        error.setPadding(dp(28), dp(28), dp(28), dp(28));
        error.setBackgroundColor(Color.rgb(247, 248, 244));

        TextView message = new TextView(this);
        message.setText(R.string.load_failed);
        message.setTextColor(Color.rgb(23, 35, 29));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        error.addView(message, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setAllCaps(false);
        retry.setOnClickListener(view -> {
            errorPanel.setVisibility(View.GONE);
            showStartup();
            webView.reload();
        });
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(180), dp(52));
        retryParams.topMargin = dp(18);
        error.addView(retry, retryParams);

        error.setVisibility(View.GONE);
        errorPanel = error;
        root.addView(error, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
        applySystemBarInsets(root);
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int appearance = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(appearance, appearance);
            }
            return;
        }
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        window.getDecorView().setSystemUiVisibility(flags);
    }

    private void applySystemBarInsets(View root) {
        root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            int left;
            int top;
            int right;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets safe = windowInsets.getInsets(
                    WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout()
                        | WindowInsets.Type.ime()
                );
                left = safe.left;
                top = safe.top;
                right = safe.right;
                bottom = safe.bottom;
            } else {
                left = windowInsets.getSystemWindowInsetLeft();
                top = windowInsets.getSystemWindowInsetTop();
                right = windowInsets.getSystemWindowInsetRight();
                bottom = windowInsets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    DisplayCutout cutout = windowInsets.getDisplayCutout();
                    if (cutout != null) {
                        left = Math.max(left, cutout.getSafeInsetLeft());
                        top = Math.max(top, cutout.getSafeInsetTop());
                        right = Math.max(right, cutout.getSafeInsetRight());
                        bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                    }
                }
            }
            view.setPadding(left, top, right, bottom);
            return windowInsets;
        });
        root.requestApplyInsets();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new AppBridge(), "UmaSeedApp");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!request.isForMainFrame()) return false;
                if (isBilibiliAppLink(uri)) {
                    returnToTool(view);
                    return true;
                }
                if (isExternalToolRequest(uri)) {
                    openExternal(Uri.parse("https://game.bilibili.com/tool/pd/"));
                    return true;
                }
                if (isBilibiliLandingPage(uri)) {
                    returnToTool(view);
                    return true;
                }
                if (isTrustedBilibiliPage(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorPanel.setVisibility(View.GONE);
                searchInterfaceReady = false;
                if (isToolPage(Uri.parse(url))) showStartup();
                else showWebView();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (isToolPage(uri)) {
                    injectExtension();
                } else if (isBilibiliLandingPage(uri)) {
                    returnToTool(view);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) errorPanel.setVisibility(View.VISIBLE);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                errorPanel.setVisibility(View.VISIBLE);
            }
        });
    }

    private final class AppBridge {
        @JavascriptInterface
        public void checkForUpdates() {
            new Thread(() -> {
                String latest = "";
                String error = "";
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(VERSION_SOURCE_URL).openConnection();
                    connection.setConnectTimeout(8000);
                    connection.setReadTimeout(8000);
                    connection.setUseCaches(false);
                    connection.setRequestProperty("User-Agent", "UmaSeedSearcher-Android");
                    int status = connection.getResponseCode();
                    if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
                    String source;
                    try (InputStream stream = connection.getInputStream()) {
                        source = new String(readAllBytes(stream), StandardCharsets.UTF_8);
                    }
                    java.util.regex.Matcher matcher = java.util.regex.Pattern
                        .compile("versionName\\s+[\"']([^\"']+)[\"']")
                        .matcher(source);
                    if (!matcher.find()) throw new IOException("versionName missing");
                    latest = matcher.group(1);
                } catch (Exception exception) {
                    error = "check_failed";
                } finally {
                    if (connection != null) connection.disconnect();
                }
                String script = "globalThis.__umaSeedUpdateResult&&globalThis.__umaSeedUpdateResult("
                    + quoteJs(latest) + "," + quoteJs(error) + ");";
                handler.post(() -> webView.evaluateJavascript(script, ignored -> { }));
            }, "uma-update-check").start();
        }

        @JavascriptInterface
        public void installUpdate(String version) {
            downloadAndInstallUpdate(version);
        }
    }

    private void downloadAndInstallUpdate(String version) {
        String normalizedVersion = String.valueOf(version).replaceFirst("^[vV]", "");
        if (!normalizedVersion.matches("\\d+\\.\\d+\\.\\d+") || updateDownloadInProgress) return;
        updateDownloadInProgress = true;
        notifyUpdateStatus("downloading", "正在下载新版… 0%");
        new Thread(() -> {
            File temporary = new File(getCacheDir(), UpdateFileProvider.FILE_NAME + ".download");
            File updateFile = new File(getCacheDir(), UpdateFileProvider.FILE_NAME);
            HttpURLConnection connection = null;
            try {
                String fileName = "uma-seed-searcher-android-v" + normalizedVersion + "-debug.apk";
                URL releaseUrl = new URL(
                    "https://github.com/yyahz/umamusume-seed-searcher-android/releases/download/v"
                        + normalizedVersion + "/" + fileName
                );
                connection = openReleaseConnection(releaseUrl);
                long expected = connection.getContentLengthLong();
                if (expected > MAX_UPDATE_BYTES) throw new IOException("Update package is too large");
                long downloaded = 0;
                int lastProgress = -1;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                    byte[] buffer = new byte[16 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        downloaded += count;
                        if (downloaded > MAX_UPDATE_BYTES) throw new IOException("Update package is too large");
                        output.write(buffer, 0, count);
                        if (expected > 0) {
                            int progress = (int) Math.min(99, downloaded * 100 / expected);
                            if (progress >= lastProgress + 5) {
                                lastProgress = progress;
                                notifyUpdateStatus("downloading", "正在下载新版… " + progress + "%");
                            }
                        }
                    }
                }
                if (downloaded <= 0) throw new IOException("Empty update package");
                if (updateFile.exists() && !updateFile.delete()) throw new IOException("Cannot replace update package");
                if (!temporary.renameTo(updateFile)) throw new IOException("Cannot finalize update package");
                verifyUpdatePackage(updateFile, normalizedVersion);
                pendingUpdateFile = updateFile;
                notifyUpdateStatus("ready", "下载完成，正在打开系统安装器…");
                handler.post(this::requestUpdateInstall);
            } catch (Exception error) {
                temporary.delete();
                updateFile.delete();
                notifyUpdateStatus("error", "更新失败，请稍后重试");
            } finally {
                updateDownloadInProgress = false;
                if (connection != null) connection.disconnect();
            }
        }, "uma-update-download").start();
    }

    private HttpURLConnection openReleaseConnection(URL initialUrl) throws IOException {
        URL current = initialUrl;
        for (int redirects = 0; redirects <= 5; redirects += 1) {
            if (!isTrustedReleaseUrl(current)) throw new IOException("Untrusted update URL");
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(20_000);
            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "UmaSeedSearcher-Android");
            int status = connection.getResponseCode();
            if (status >= 200 && status < 300) return connection;
            if (status < 300 || status >= 400) {
                connection.disconnect();
                throw new IOException("HTTP " + status);
            }
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null || location.isEmpty()) throw new IOException("Missing redirect location");
            current = new URL(current, location);
        }
        throw new IOException("Too many redirects");
    }

    private boolean isTrustedReleaseUrl(URL url) {
        if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
        String host = url.getHost().toLowerCase(Locale.ROOT);
        return host.equals("github.com")
            || host.equals("objects.githubusercontent.com")
            || host.equals("release-assets.githubusercontent.com");
    }

    @SuppressWarnings("deprecation")
    private void verifyUpdatePackage(File file, String expectedVersion) throws Exception {
        PackageManager packageManager = getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo archive = packageManager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = packageManager.getPackageInfo(getPackageName(), flags);
        if (archive == null || !getPackageName().equals(archive.packageName)) {
            throw new IOException("Unexpected package name");
        }
        if (!expectedVersion.equals(archive.versionName) || versionCodeOf(archive) <= versionCodeOf(installed)) {
            throw new IOException("Unexpected update version");
        }
        if (!sameSignatures(signaturesOf(installed), signaturesOf(archive))) {
            throw new IOException("Update signature mismatch");
        }
    }

    @SuppressWarnings("deprecation")
    private Signature[] signaturesOf(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            return info.signingInfo.getApkContentsSigners();
        }
        return info.signatures == null ? new Signature[0] : info.signatures;
    }

    @SuppressWarnings("deprecation")
    private long versionCodeOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private boolean sameSignatures(Signature[] left, Signature[] right) {
        if (left.length == 0 || left.length != right.length) return false;
        String[] a = Arrays.stream(left).map(Signature::toCharsString).sorted().toArray(String[]::new);
        String[] b = Arrays.stream(right).map(Signature::toCharsString).sorted().toArray(String[]::new);
        return Arrays.equals(a, b);
    }

    private void requestUpdateInstall() {
        File file = pendingUpdateFile;
        if (file == null || !file.isFile()) {
            notifyUpdateStatus("error", "安装包不可用，请重新下载");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            awaitingInstallPermission = true;
            notifyUpdateStatus("permission", "请允许安装未知应用，然后返回本应用");
            try {
                startActivity(new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())
                ));
            } catch (ActivityNotFoundException error) {
                awaitingInstallPermission = false;
                notifyUpdateStatus("error", "无法打开安装授权页面");
            }
            return;
        }
        launchUpdateInstaller(file);
    }

    private void launchUpdateInstaller(File file) {
        pendingUpdateFile = null;
        Uri uri = Uri.parse("content://" + UPDATE_AUTHORITY + UpdateFileProvider.CONTENT_PATH);
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(intent);
            notifyUpdateStatus("installer", "请在系统安装器中确认更新");
        } catch (ActivityNotFoundException error) {
            notifyUpdateStatus("error", "未找到可用的系统安装器");
        }
    }

    private void notifyUpdateStatus(String state, String message) {
        String script = "globalThis.__umaSeedInstallStatus&&globalThis.__umaSeedInstallStatus("
            + quoteJs(state) + "," + quoteJs(message) + ");";
        handler.post(() -> webView.evaluateJavascript(script, ignored -> { }));
    }

    private static byte[] readAllBytes(InputStream stream) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
        return output.toByteArray();
    }

    private boolean isTrustedBilibiliPage(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        if (host == null) return false;
        String normalizedHost = host.toLowerCase(java.util.Locale.ROOT);
        return normalizedHost.equals("bilibili.com")
            || normalizedHost.endsWith(".bilibili.com")
            || normalizedHost.equals("passport.biligame.com")
            || normalizedHost.endsWith(".passport.biligame.com");
    }

    private boolean isToolPage(Uri uri) {
        return isTrustedBilibiliPage(uri)
            && "game.bilibili.com".equalsIgnoreCase(uri.getHost())
            && uri.getPath() != null
            && uri.getPath().startsWith("/tool/pd");
    }

    private boolean isAuthenticationPage(Uri uri) {
        if (!isTrustedBilibiliPage(uri)) return false;
        String host = uri.getHost();
        String path = uri.getPath();
        String normalizedHost = host == null ? "" : host.toLowerCase(java.util.Locale.ROOT);
        String normalizedPath = path == null ? "" : path.toLowerCase(java.util.Locale.ROOT);
        return normalizedHost.contains("passport")
            || normalizedHost.startsWith("account.")
            || normalizedHost.startsWith("login.")
            || normalizedPath.contains("/passport/")
            || normalizedPath.contains("/login/");
    }

    private boolean isBilibiliLandingPage(Uri uri) {
        if (!isTrustedBilibiliPage(uri) || isToolPage(uri) || isAuthenticationPage(uri)) return false;
        String host = uri.getHost();
        String path = uri.getPath();
        String normalizedHost = host == null ? "" : host.toLowerCase(java.util.Locale.ROOT);
        String normalizedPath = path == null || path.isEmpty() ? "/" : path.toLowerCase(java.util.Locale.ROOT);
        boolean landingHost = normalizedHost.equals("bilibili.com")
            || normalizedHost.equals("www.bilibili.com")
            || normalizedHost.equals("m.bilibili.com")
            || normalizedHost.equals("game.bilibili.com");
        return landingHost && (normalizedPath.equals("/") || normalizedPath.equals("/index.html"));
    }

    private boolean isBilibiliAppLink(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null) return false;
        String normalized = scheme.toLowerCase(java.util.Locale.ROOT);
        return normalized.equals("bilibili")
            || normalized.equals("biligame")
            || normalized.equals("intent");
    }

    private void returnToTool(WebView view) {
        CookieManager.getInstance().flush();
        if (!TOOL_URL.equals(view.getUrl())) view.loadUrl(TOOL_URL);
        else view.reload();
    }

    private boolean isExternalToolRequest(Uri uri) {
        return isToolPage(uri) && "1".equals(uri.getQueryParameter("uma_seed_external"));
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // Keep the current page intact if the device has no handler for the URL.
        }
    }

    private void injectExtension() {
        try {
            String iconDataUrl = "data:image/png;base64," + Base64.encodeToString(
                readAssetBytes("icon-128.png"),
                Base64.NO_WRAP
            );
            String shim = "(() => {"
                + "const icon=" + quoteJs(iconDataUrl) + ";"
                + "const storage={local:{"
                + "get:(key)=>{const keys=Array.isArray(key)?key:[key];const out={};"
                + "for(const k of keys){try{const raw=localStorage.getItem('uma-app:'+k);if(raw!==null)out[k]=JSON.parse(raw);}catch(_){}}return Promise.resolve(out);},"
                + "set:(values)=>{for(const [k,v] of Object.entries(values||{})){try{localStorage.setItem('uma-app:'+k,JSON.stringify(v));}catch(_){}}return Promise.resolve();}"
                + "}};"
                + "globalThis.chrome={...(globalThis.chrome||{}),runtime:{getURL:()=>icon},storage};"
                + "})();";
            evaluateSequence(0, shim);
        } catch (IOException ignored) {
            errorPanel.setVisibility(View.VISIBLE);
        }
    }

    private void evaluateSequence(int scriptIndex, String source) {
        webView.evaluateJavascript(source, ignored -> {
            if (scriptIndex < EXTENSION_SCRIPTS.size()) {
                try {
                    String nextSource = readAssetText(EXTENSION_SCRIPTS.get(scriptIndex));
                    evaluateSequence(scriptIndex + 1, nextSource);
                } catch (IOException error) {
                    errorPanel.setVisibility(View.VISIBLE);
                }
                return;
            }
            waitForSearchInterface();
        });
    }

    private void waitForSearchInterface() {
        readinessAttempts = 0;
        pollSearchInterface();
    }

    private void pollSearchInterface() {
        String probe = "(() => {"
            + "const host=document.getElementById('uma-seed-optimizer-host');"
            + "const root=host&&host.shadowRoot;if(!root)return 'loading';"
            + "const status=(root.getElementById('status')?.textContent||'').trim();"
            + "if(status.startsWith('已读取 ')){"
            + "const close=root.getElementById('close');if(close)close.style.display='none';"
            + "const panel=root.getElementById('panel');const launcher=root.getElementById('launcher');"
            + "if(panel&&launcher&&!panel.classList.contains('open'))launcher.click();"
            + "return 'ready';}"
            + "if(status&&!status.startsWith('正在'))return 'login';"
            + "return 'loading';"
            + "})();";
        webView.evaluateJavascript(probe, result -> {
            String state = result == null ? "" : result.replace("\"", "");
            if ("ready".equals(state)) {
                searchInterfaceReady = true;
                showWebView();
                return;
            }
            if ("login".equals(state) || readinessAttempts >= 60) {
                showWebView();
                return;
            }
            readinessAttempts += 1;
            handler.postDelayed(this::pollSearchInterface, 250);
        });
    }

    private void showStartup() {
        webView.setVisibility(View.INVISIBLE);
        startupPanel.setVisibility(View.VISIBLE);
    }

    private void showWebView() {
        webView.setVisibility(View.VISIBLE);
        startupPanel.setVisibility(View.GONE);
    }

    private String readAssetText(String path) throws IOException {
        return new String(readAssetBytes(path), StandardCharsets.UTF_8);
    }

    private byte[] readAssetBytes(String path) throws IOException {
        try (InputStream input = getAssets().open(path);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    private String quoteJs(String value) {
        return "\"" + value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\r", "\\r")
            .replace("\n", "\\n")
            .replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029") + "\"";
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!awaitingInstallPermission) return;
        awaitingInstallPermission = false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
            requestUpdateInstall();
        } else {
            notifyUpdateStatus("error", "未获得安装权限，更新已取消");
        }
    }

    @Override
    public void onBackPressed() {
        if (searchInterfaceReady) {
            String mobileBack = "(() => Boolean(globalThis.__UMA_SEED_SEARCHER_MOBILE_UI__?.back?.()))();";
            webView.evaluateJavascript(mobileBack, handled -> {
                if (!"true".equals(handled)) finish();
            });
            return;
        }
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
