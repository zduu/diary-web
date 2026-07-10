package de.edxx.diary;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitor 8 核心不路由系统返回键。前端用 pushState 为每个打开的弹窗
        // 注册了历史条目：能回退时交给 WebView（触发 popstate 逐层关闭弹窗），
        // 否则回落到系统默认行为（退出/后台）。
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        WebView webView = getBridge() != null ? getBridge().getWebView() : null;

                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                            return;
                        }

                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                }
            );
    }
}
