// CustomWebChromeClient.kt --- カスタム Chrome クライアント
// Author: katahiromz
// License: MIT
// Copyright (c) 2023-2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.privacy_camera

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import timber.log.Timber
import java.util.Locale

class CustomWebChromeClient(
    private var activity: MainActivity?,
    private val listener: Listener,
    private val permissionManager: PermissionManager,
    private val onFileChooser: (ValueCallback<Array<Uri>>?, String?) -> Unit
) : WebChromeClient() {
    // リスナ。
    interface Listener {
        fun onSpeech(text: String, volume: Float): Boolean
        fun onShowToast(text: String, typeOfToast: Int)
        fun onShowSnackbar(text: String, typeOfSnack: Int)
        fun onProgressChanged(view: WebView?, newProgress: Int)
        fun onBrightness(value: String)
        fun onFinishApp()
        fun onStartVibrator(length: Int)
        fun onStopVibrator()
        fun onStartShutterSound()
        fun onEndShutterSound()
    }

    // ローカライズされた文字列を取得する。
    // 複数の翻訳版に対応するため、特別に処理を用意した。
    private fun getLocString(resId: Int): String {
        return activity?.getLocString(resId) ?: ""
    }

    override fun onProgressChanged(view: WebView?, newProgress: Int) {
        listener.onProgressChanged(view, newProgress)
    }

    // Web側からの権限リクエストを処理
    override fun onPermissionRequest(request: PermissionRequest) {
        permissionManager.onPermissionRequest(request)
    }

    // ファイル選択（Android 5.0以上）
    override fun onShowFileChooser(
        webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
    ): Boolean {
        val acceptTypes = fileChooserParams?.acceptTypes?.firstOrNull() ?: "*/*"

        // ストレージ権限をチェック
        if (!permissionManager.hasPermissions(PermissionManager.STORAGE_PERMISSIONS)) {
            permissionManager.requestPermissions(PermissionManager.STORAGE_PERMISSIONS) { results ->
                // results は Map<String, Boolean> なので、すべて true かチェック
                val isAllGranted = results.values.all { it }
                if (isAllGranted) {
                    onFileChooser(filePathCallback, acceptTypes)
                } else {
                    // 拒否された場合は null を返して FileChooser をキャンセルする
                    filePathCallback?.onReceiveValue(null)

                    // 必要に応じて MainActivity の showPermissionDeniedDialog を呼ぶ
                    // (activity は MainActivity のインスタンスと想定)
                    val deniedList = results.filter { !it.value }.keys.toList()
                    permissionManager.showPermissionDeniedDialog(deniedList)
                }
            }
        } else {
            onFileChooser(filePathCallback, acceptTypes)
        }

        return true
    }

    /////////////////////////////////////////////////////////////////////
    // JavaScript interface-related
    // これらの関数はJavaScriptからアクセスできる。

    // 画面の明るさを調整する。
    @JavascriptInterface
    fun setBrightness(brightness: String) {
        Timber.i("setBrightness")
        listener.onBrightness(brightness)
    }

    // アプリを終了する。
    @JavascriptInterface
    fun finishApp() {
        Timber.i("finishApp")
        listener.onFinishApp()
    }

    // スピーチをキャンセルする。
    @JavascriptInterface
    fun cancelSpeech() {
        Timber.i("cancelSpeech")
        listener.onSpeech("", -1.0f)
    }

    // スピーチする。
    @JavascriptInterface
    fun startSpeech(msg: String, volume: Float): Boolean {
        Timber.i("startSpeech")
        return listener.onSpeech(msg, volume)
    }

    // GenericAppの設定をクリアする。
    @JavascriptInterface
    fun clearSettings() {
        Timber.i("clearSettings")
        activity?.let { MainRepository.clearMessageList(it) }
    }

    // 振動を開始する。
    @JavascriptInterface
    fun startVibrator(length: Float) {
        Timber.i("startVibrator")
        listener.onStartVibrator(length.toInt())
    }

    // 振動を停止する。
    @JavascriptInterface
    fun stopVibrator() {
        Timber.i("stopVibrator")
        listener.onStopVibrator()
    }

    // アプリ設定を開く
    @JavascriptInterface
    fun openAppSettings() {
      permissionManager.openAppSettings()
    }

    // Toastを表示する。
    @JavascriptInterface
    fun showToast(text: String) {
        Timber.i("showToast")
        listener.onShowToast(text, LONG_TOAST)
    }

    // Snackbarを表示する。
    @JavascriptInterface
    fun showSnackbar(text: String) {
        Timber.i("showSnackbar")
        listener.onShowSnackbar(text, LONG_SNACK)
    }

    // シャッター音を開始する前に音量を調整する。
    @JavascriptInterface
    fun onStartShutterSound() {
        Timber.i("onStartShutterSound")
        listener.onStartShutterSound()
    }

    // シャッター音を終了した後に音量を調整する。
    @JavascriptInterface
    fun onEndShutterSound() {
        Timber.i("onEndShutterSound")
        listener.onEndShutterSound()
    }

    // 画面ONをキープする
    @JavascriptInterface
    fun onStartRecording() {
        Timber.i("onStartRecording")
        activity?.runOnUiThread {
            activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // URLを開く
    @JavascriptInterface
    fun openURL(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            activity?.startActivity(intent)
        } catch (e: Exception) {
            Timber.e(e, "Failed to open URL: $url")
        }
    }

    // 画面ONのキープを解除する
    @JavascriptInterface
    fun onStopRecording() {
        Timber.i("onStopRecording")
        activity?.runOnUiThread {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // TopSnackbarを表示してファイルを開くアクションを提供するヘルパーメソッド
    private fun showFileOpenSnackbar(currentActivity: MainActivity, uri: Uri, messageResId: Int, mimeType: String) {
        Timber.i("showFileOpenSnackbar")
        currentActivity.runOnUiThread {
            try {
                val message = currentActivity.getString(messageResId)
                val actionLabel = currentActivity.getString(R.string.open_file)
                TopSnackbar.show(
                    currentActivity,
                    message,
                    actionLabel,
                    {
                        try {
                            val openIntent = Intent(Intent.ACTION_VIEW).apply {
                                setDataAndType(uri, mimeType)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            // アプリが利用可能かチェック
                            if (openIntent.resolveActivity(currentActivity.packageManager) != null) {
                                currentActivity.startActivity(openIntent)
                            } else {
                                Timber.w("No app available to open file of type: $mimeType")
                            }
                        } catch (e: Exception) {
                            Timber.e(e, "Failed to open file")
                        }
                    }
                )
            } catch (e: Exception) {
                Timber.e(e, "Failed to show TopSnackbar")
            }
        }
    }

    // 画像または動画をギャラリーに保存する
    @JavascriptInterface
    fun saveMediaToGallery(
        base64Data: String,
        filename: String,
        mimeType: String,
        type: String): Boolean
    {
        val currentActivity = activity ?: return false

        // Android 9以前では権限チェック
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(currentActivity, android.Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
                android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                Timber.e("WRITE_EXTERNAL_STORAGE permission not granted")

                // UIスレッドで権限リクエストを実行
                currentActivity.runOnUiThread {
                    permissionManager.requestPermissions(PermissionManager.STORAGE_PERMISSIONS) { results ->
                        val isAllGranted = results.values.all { it }
                        if (isAllGranted) {
                            // 権限取得後、再度保存を試行
                            saveMediaToGallery(base64Data, filename, mimeType, type)
                        } else {
                            Timber.w("Storage permission denied by user")
                            Toast.makeText(
                                currentActivity,
                                currentActivity.getString(R.string.needs_storage),
                                Toast.LENGTH_SHORT
                            )
                        }
                    }
                }
            }
        }

        val pureBase64 = if (base64Data.contains(",")) {
            base64Data.substring(base64Data.lastIndexOf(",") + 1)
        } else {
            base64Data
        }

        val mediaBytes = try {
            android.util.Base64.decode(pureBase64, android.util.Base64.DEFAULT)
        } catch (e: Exception) {
            Timber.e("Exception: %s", e.toString())
            return false;
        }
        Timber.i("mediaBytes: %s", mediaBytes.size.toString())

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            // Android 10以降: MediaStore APIを使用
            val contentValues = android.content.ContentValues().apply {
                when (type) {
                    "video" -> {
                        put(android.provider.MediaStore.Video.Media.DISPLAY_NAME, filename)
                        put(android.provider.MediaStore.Video.Media.MIME_TYPE, mimeType)
                        put(android.provider.MediaStore.Video.Media.RELATIVE_PATH,
                            android.os.Environment.DIRECTORY_MOVIES + "/PrivacyCamera")
                    }
                    "photo" -> {
                        put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, filename)
                        put(android.provider.MediaStore.Images.Media.MIME_TYPE, mimeType)
                        put(android.provider.MediaStore.Images.Media.RELATIVE_PATH,
                            android.os.Environment.DIRECTORY_PICTURES + "/PrivacyCamera")
                    }
                    "audio" -> {
                        put(android.provider.MediaStore.Audio.Media.DISPLAY_NAME, filename)
                        put(android.provider.MediaStore.Audio.Media.MIME_TYPE, mimeType)
                        put(android.provider.MediaStore.Audio.Media.RELATIVE_PATH,
                            android.os.Environment.DIRECTORY_PICTURES + "/PrivacyCamera")
                    }
                    else -> assert(false)
                }
            }

            val url = if (type == "video") {
                android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            } else if (type == "photo") {
                android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            } else if (type == "audio") {
                android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            } else {
                android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI
            }
            val uri = currentActivity.contentResolver.insert(url, contentValues)

            currentActivity.contentResolver.openOutputStream(uri!!)?.use { outputStream ->
                outputStream.write(mediaBytes)
            }

            // Snackbarを表示
            when (type) {
                "video" -> {
                    showFileOpenSnackbar(currentActivity, uri!!, R.string.video_saved, "video/*")
                }
                "photo" -> {
                    showFileOpenSnackbar(currentActivity, uri!!, R.string.image_saved, "image/*")
                }
                "audio" -> {
                    showFileOpenSnackbar(currentActivity, uri!!, R.string.audio_saved, "audio/*")
                }
                else -> {
                    assert(false)
                }
            }

            return true
        } else {
            // Android 9以前: 従来の方法
            val dirType = if (type == "video") {
                android.os.Environment.DIRECTORY_MOVIES
            } else if (type == "photo") {
                android.os.Environment.DIRECTORY_PICTURES
            } else if (type == "audio") {
                android.os.Environment.DIRECTORY_RINGTONES
            } else {
                android.os.Environment.DIRECTORY_DOCUMENTS
            }
            val mediaDir = android.os.Environment.getExternalStoragePublicDirectory(dirType)
            val appDir = java.io.File(mediaDir, "PrivacyCamera")
            if (!appDir.exists()) {
                appDir.mkdirs()
            }

            val file = java.io.File(appDir, filename)
            java.io.FileOutputStream(file).use { outputStream ->
                outputStream.write(mediaBytes)
            }

            // MediaScannerConnectionを使ってギャラリーに通知
            android.media.MediaScannerConnection.scanFile(
                currentActivity,
                arrayOf(file.absolutePath),
                arrayOf(mimeType),
                null
            )

            // Snackbarを表示
            val uri = android.net.Uri.fromFile(file)
            when (type) {
                "video" -> showFileOpenSnackbar(currentActivity, uri, R.string.video_saved, "video/*")
                "photo" -> showFileOpenSnackbar(currentActivity, uri, R.string.image_saved, "image/*")
                "audio" -> showFileOpenSnackbar(currentActivity, uri, R.string.audio_saved, "audio/*")
                else -> assert(false)
            }

            return true
        }
    }

    // 現在の言語をセットする。
    @JavascriptInterface
    fun setLanguage(lang: String) {
        // {{LANGUAGE_SPECIFIC}}
        // TODO: Add the language(s) you need and remove the ones you don't need.
        val locale : Locale
        when (lang) {
            "ja", "jp", "ja-JP" -> { // Japanese
                locale = Locale.JAPANESE
            }
            else -> { // English is default
                locale = Locale.ENGLISH
            }
        }
        Locale.setDefault(locale)
        activity?.setCurLocale(locale)
    }

    private var modalDialog: AlertDialog? = null

    // JavaScriptのalert関数をフックする。
    override fun onJsAlert(
        view: WebView?,
        url: String?,
        message: String?,
        result: JsResult?
    ): Boolean {
        Timber.i("onJsAlert")
        // MaterialAlertDialogを使用して普通に実装する。
        val currentActivity = activity ?: run {
            result?.cancel()
            return false
        }
        val title = getLocString(R.string.app_name)
        val okText = getLocString(R.string.ok)
        modalDialog = MaterialAlertDialogBuilder(currentActivity, R.style.AlertDialogTheme)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(okText) { _, _ ->
                result?.confirm()
                modalDialog = null
            }
            .setCancelable(false)
            .create()
        modalDialog?.show()
        return true
    }

    // JavaScriptのconfirm関数をフックする。
    override fun onJsConfirm(
        view: WebView?,
        url: String?,
        message: String?,
        result: JsResult?
    ): Boolean {
        Timber.i("onJsConfirm")
        // MaterialAlertDialogを使用して普通に実装する。
        val currentActivity = activity ?: run {
            result?.cancel()
            return false
        }
        val title = getLocString(R.string.app_name)
        val okText = getLocString(R.string.ok)
        val cancelText = getLocString(R.string.cancel)
        modalDialog = MaterialAlertDialogBuilder(currentActivity, R.style.AlertDialogTheme)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(okText) { _, _ ->
                result?.confirm()
                modalDialog = null
            }
            .setNegativeButton(cancelText) { _, _ ->
                result?.cancel()
                modalDialog = null
            }
            .setCancelable(false)
            .create()
        modalDialog?.show()
        return true
    }

    // JavaScriptのprompt関数をフックする。
    override fun onJsPrompt(
        view: WebView?,
        url: String?,
        message: String?,
        defaultValue: String?,
        result: JsPromptResult?
    ): Boolean {
        Timber.i("onJsPrompt")
        val currentActivity = activity ?: run {
            result?.cancel()
            return false
        }
        currentActivity.currLocaleContext = null
        val title = getLocString(R.string.app_name)

        // MaterialAlertDialogを使用して普通に実装する。
        val okText = getLocString(R.string.ok)
        val cancelText = getLocString(R.string.cancel)
        val input = EditText(currentActivity)
        input.inputType = InputType.TYPE_CLASS_TEXT
        input.setText(if (defaultValue != null) defaultValue else "")
        modalDialog = MaterialAlertDialogBuilder(currentActivity, R.style.AlertDialogTheme)
            .setTitle(title)
            .setMessage(message)
            .setView(input)
            .setPositiveButton(okText) { _, _ ->
                result?.confirm(input.text.toString())
                modalDialog = null
            }
            .setNegativeButton(cancelText) { _, _ ->
                result?.cancel()
                modalDialog = null
            }
            .setCancelable(false)
            .create()
        modalDialog?.show()
        return true
    }

    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
        if (BuildConfig.DEBUG) {
            if (consoleMessage != null) {
                val msg = consoleMessage.message()
                val line = consoleMessage.lineNumber()
                val src = consoleMessage.sourceId()
                Timber.d("console: $msg at Line $line of $src")
            }
        }
        return super.onConsoleMessage(consoleMessage)
    }
}
