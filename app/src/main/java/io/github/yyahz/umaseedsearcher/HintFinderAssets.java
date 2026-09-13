package io.github.yyahz.umaseedsearcher;
import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;

/** Local resources for the skills tab; never fetch the asset origin over the network. */
final class HintFinderAssets {
    static WebResourceResponse intercept(AssetManager assets, WebResourceRequest request) {
        Uri uri=request.getUrl();
        if (!"appassets.androidplatform.net".equals(uri.getHost())) return null;
        String path=uri.getPath();
        if (!"https".equals(uri.getScheme()) || !"GET".equals(request.getMethod()) || path==null
            || path.contains("..") || path.contains("\\")) return missing();
        if (path.equals("/")) path="/index.html";
        String mime=path.endsWith(".mjs")||path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".json")?"application/json":path.endsWith(".svg")?"image/svg+xml":"text/html";
        try {return new WebResourceResponse(mime,"UTF-8",assets.open("hint-finder"+path));}
        catch(IOException ignored){return missing();}
    }
    private static WebResourceResponse missing(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,new ByteArrayInputStream(new byte[0]));}
}
