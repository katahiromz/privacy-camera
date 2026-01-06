// GenericAppのウェブビュー クライアント。
// Copyright (c) 2023-2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.privacy_camera

import android.content.Intent
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

class CustomWebViewClient(
    private val listener: Listener,
    private val assetLoader: WebViewAssetLoader
) : WebViewClient() {
    companion object {
        private const val ASSET_LOADER_DOMAIN = "https://appassets.androidplatform.net/"
    }

    // リスナー。
    interface Listener {
        fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?)
        fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?,
                                errorResponse: WebResourceResponse?)
        fun onPageFinished(view: WebView?, url: String?)
    }

    // リソースリクエストをインターセプトしてWebViewAssetLoaderを使って処理する。
    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest
    ): WebResourceResponse? {
        val response = assetLoader.shouldInterceptRequest(request.url)
        if (response != null) {
            android.util.Log.d("CustomWebViewClient", "Intercepted: ${request.url}")
        }
        return response
    }

    // 読み込み可能なURLを制限したり、フックする。
    override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: WebResourceRequest?
    ): Boolean {
        if (view != null && request != null) {
            val url: String = request.url.toString() // 文字列化

            // 1. アプリ内アセット（内部コンテンツ）の場合はWebView内で処理を続行
            if (url.startsWith(ASSET_LOADER_DOMAIN)) {
                return false
            }

            // 2. それ以外のURL（http/https）は外部ブラウザを起動する
            try {
                val intent = Intent(Intent.ACTION_VIEW, request.url)
                view.context.startActivity(intent)
                return true // アプリ側で処理（Intent発行）したのでWebViewには遷移させない
            } catch (e: Exception) {
                // ブラウザが見つからないなどのエラーハンドリング
                return false
            }
        }
        return true
    }

    // ウェブビューからのエラーをリスナーに渡す。
    override fun onReceivedError(view: WebView?, request: WebResourceRequest?,
                                 error: WebResourceError?)
    {
        super.onReceivedError(view, request, error)
        listener.onReceivedError(view, request, error)
    }

    // ウェブビューからのエラーをリスナーに渡す。
    override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?,
                                     errorResponse: WebResourceResponse?)
    {
        super.onReceivedHttpError(view, request, errorResponse)
        listener.onReceivedHttpError(view, request, errorResponse)
    }

    // ウェブビューからのエラーをリスナーに渡す。
    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        listener.onPageFinished(view, url)
    }
}