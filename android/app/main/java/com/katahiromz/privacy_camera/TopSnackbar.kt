// TopSnackbar: A custom view that displays notifications at the top of the screen.
// Copyright (c) 2023-2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.privacy_camera

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import timber.log.Timber
import kotlin.math.abs

/**
 * TopSnackbar displays a Snackbar-like notification at the top of the screen.
 *
 * Features:
 * - Displays at the top of the screen with slide-in animation
 * - Respects safe area (status bar, notch) using WindowInsets
 * - Auto-dismisses after specified duration with fade-out animation
 * - Supports optional action button with callback
 * - Replaces existing TopSnackbar when show() is called multiple times
 * - Accessibility support with contentDescription
 * - Swipe to dismiss (up, left, or right)
 */
@SuppressLint("StaticFieldLeak")
object TopSnackbar {
    // Constants
    private const val SLIDE_DISTANCE = -500f
    private const val SNACKBAR_BACKGROUND_COLOR = "#323232"
    private const val ACTION_BUTTON_COLOR = "#64B5F6"
    private const val ANIMATION_DURATION_SHOW = 300L
    private const val ANIMATION_DURATION_HIDE = 200L
    private const val SWIPE_THRESHOLD = 50f
    private const val SWIPE_VELOCITY_THRESHOLD = 50f

    @Volatile
    private var currentSnackbarView: View? = null
    @Volatile
    private var currentAnimator: AnimatorSet? = null
    @Volatile
    private var dismissRunnable: Runnable? = null

    private var currentActivity: Activity? = null

    /**
     * Show a TopSnackbar notification.
     *
     * @param activity The activity to display the snackbar in
     * @param message The message text to display
     * @param actionLabel Optional action button label
     * @param action Optional action button callback
     * @param durationMillis Duration to display the snackbar (default: 3000ms)
     */
    fun show(
        activity: Activity,
        message: String,
        actionLabel: String? = null,
        action: (() -> Unit)? = null,
        durationMillis: Int = 3000
    ) {
        Timber.d("TopSnackbar: show called")
        // メインスレッド以外から呼ばれた場合はメインスレッドにディスパッチする
        if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) {
            activity.runOnUiThread { show(activity, message, actionLabel, action, durationMillis) }
            return
        }
        currentActivity = activity
        try {
            // Dismiss any existing snackbar first
            dismiss()

            // Get the root view
            val rootView = activity.findViewById<ViewGroup>(android.R.id.content)

            // Create the snackbar container
            val snackbarView = createSnackbarView(activity, message, actionLabel, action)

            // Set initial position (hidden above screen)
            snackbarView.translationY = SLIDE_DISTANCE
            snackbarView.alpha = 0f

            // Add swipe gesture support
            setupSwipeGesture(snackbarView)

            // Add to root view
            rootView.addView(snackbarView)

            // Apply window insets to respect safe area
            ViewCompat.setOnApplyWindowInsetsListener(snackbarView) { view, insets ->
                val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                val topInset = systemBars.top

                // Apply top margin to avoid status bar/notch
                val layoutParams = view.layoutParams as FrameLayout.LayoutParams
                layoutParams.topMargin = topInset
                view.layoutParams = layoutParams

                insets
            }

            // Request insets to be applied
            ViewCompat.requestApplyInsets(snackbarView)

            // Store reference
            currentSnackbarView = snackbarView

            // Animate slide-in from top
            val slideIn = ObjectAnimator.ofFloat(snackbarView, "translationY", SLIDE_DISTANCE, 0f)
            val fadeIn = ObjectAnimator.ofFloat(snackbarView, "alpha", 0f, 1f)

            val showAnimator = AnimatorSet().apply {
                playTogether(slideIn, fadeIn)
                duration = ANIMATION_DURATION_SHOW
            }

            currentAnimator = showAnimator
            showAnimator.start()

            // Schedule auto-dismiss
            dismissRunnable = Runnable {
                dismissWithAnimation()
            }
            dismissRunnable?.let { snackbarView.postDelayed(it, durationMillis.toLong()) }
        } catch (e: Exception) {
            Timber.e(e, "Failed to show TopSnackbar")
        }
    }

    /**
     * Dismiss the current TopSnackbar immediately without animation.
     */
    fun dismiss() {
        currentActivity!!?.runOnUiThread { // 安全のため UI スレッドで実行
            currentAnimator?.end() // cancel ではなく end で確実に終了状態へ
            currentAnimator = null

            currentSnackbarView?.let { view ->
                dismissRunnable?.let { view.removeCallbacks(it) }
                dismissRunnable = null

                val parent = view.parent as? ViewGroup
                parent?.removeView(view)
                Timber.d("TopSnackbar: Removed from parent")
            }
            currentSnackbarView = null
        }
    }

    /**
     * Dismiss the current TopSnackbar with fade-out animation.
     */
    private fun dismissWithAnimation() {
        val view = currentSnackbarView ?: return

        currentAnimator?.cancel()

        // Cancel any pending dismiss callback
        dismissRunnable?.let { view.removeCallbacks(it) }
        dismissRunnable = null

        val slideOut = ObjectAnimator.ofFloat(view, "translationY", 0f, SLIDE_DISTANCE)
        val fadeOut = ObjectAnimator.ofFloat(view, "alpha", 1f, 0f)

        val hideAnimator = AnimatorSet().apply {
            playTogether(slideOut, fadeOut)
            duration = ANIMATION_DURATION_HIDE
        }

        hideAnimator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                dismiss()
            }
        })

        currentAnimator = hideAnimator
        hideAnimator.start()
    }

    /**
     * Dismiss with swipe animation in the specified direction.
     */
    private fun dismissWithSwipe(view: View, direction: SwipeDirection) {
        currentAnimator?.cancel()

        // Cancel any pending dismiss callback
        dismissRunnable?.let { view.removeCallbacks(it) }
        dismissRunnable = null

        val (translationXEnd, translationYEnd) = when (direction) {
            SwipeDirection.UP -> 0f to SLIDE_DISTANCE
            SwipeDirection.LEFT -> -view.width.toFloat() to 0f
            SwipeDirection.RIGHT -> view.width.toFloat() to 0f
        }

        val slideOutX = ObjectAnimator.ofFloat(view, "translationX", view.translationX, translationXEnd)
        val slideOutY = ObjectAnimator.ofFloat(view, "translationY", view.translationY, translationYEnd)
        val fadeOut = ObjectAnimator.ofFloat(view, "alpha", view.alpha, 0f)

        val hideAnimator = AnimatorSet().apply {
            playTogether(slideOutX, slideOutY, fadeOut)
            duration = ANIMATION_DURATION_HIDE
        }

        hideAnimator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                dismiss()
            }
        })

        currentAnimator = hideAnimator
        hideAnimator.start()
    }

    /**
     * Setup swipe gesture detection for dismiss.
     */
    private fun setupSwipeGesture(view: View) {
        var hasMoved = false
        var downX = 0f
        var downY = 0f
        val gestureDetector = GestureDetector(view.context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onFling(
                e1: MotionEvent?,
                e2: MotionEvent,
                velocityX: Float,
                velocityY: Float
            ): Boolean {
                val startEvent = e1 ?: return false

                val diffX = e2.x - startEvent.x
                val diffY = e2.y - startEvent.y

                Timber.d("TopSnackbar onFling diffX=%.1f diffY=%.1f vX=%.1f vY=%.1f", diffX, diffY, velocityX, velocityY)

                // Check if swipe distance exceeds threshold
                if (abs(diffX) > SWIPE_THRESHOLD || abs(diffY) > SWIPE_THRESHOLD) {
                    // Check if it's primarily a vertical swipe (UP)
                    if (abs(diffY) > abs(diffX)) {
                        if (diffY < 0 && abs(velocityY) > SWIPE_VELOCITY_THRESHOLD) {
                            // Swipe Up
                            dismissWithSwipe(view, SwipeDirection.UP)
                            return true
                        }
                    }
                    // Check if it's primarily a horizontal swipe (LEFT or RIGHT)
                    else {
                        if (abs(velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                            if (diffX < 0) {
                                // Swipe Left
                                dismissWithSwipe(view, SwipeDirection.LEFT)
                                return true
                            } else {
                                // Swipe Right
                                dismissWithSwipe(view, SwipeDirection.RIGHT)
                                return true
                            }
                        }
                    }
                }
                return false
            }

            // onDownを追加: ACTION_DOWNで必ずtrueを返し、ジェスチャー検知の初期化と後続イベントの処理を保証する
            override fun onDown(e: MotionEvent): Boolean {
                return true
            }
        })

        view.setOnTouchListener { v, event ->
            // Check if touch is within a clickable child view (e.g., action button)
            if (isTouchOnClickableChild(v as ViewGroup, event)) {
                // Let the child view handle the touch event normally
                return@setOnTouchListener false
            }

            // Otherwise, pass to gesture detector for swipe-to-dismiss
            gestureDetector.onTouchEvent(event)
        }
    }

    /**
     * Check if a touch event is within the bounds of any clickable child view.
     *
     * @param viewGroup The parent ViewGroup to check for clickable children
     * @param event The touch event containing coordinates
     * @return true if the touch is within a clickable child's bounds, false otherwise
     */
    private fun isTouchOnClickableChild(viewGroup: ViewGroup, event: MotionEvent): Boolean {
        val x = event.x
        val y = event.y

        for (i in 0 until viewGroup.childCount) {
            val child = viewGroup.getChildAt(i)
            
            // Check if child is clickable (e.g., Button)
            if (child.isClickable) {
                // Use child.left/top for efficient relative position calculation
                val childLeft = child.left.toFloat()
                val childTop = child.top.toFloat()
                val childRight = childLeft + child.width
                val childBottom = childTop + child.height

                // Check if touch is within child bounds
                if (x >= childLeft && x < childRight &&
                    y >= childTop && y < childBottom) {
                    return true
                }
            }

            // Recursively check if the child is a ViewGroup with clickable children
            if (child is ViewGroup) {
                // Adjust event coordinates relative to the child ViewGroup
                val childX = x - child.left
                val childY = y - child.top
                val childEvent = MotionEvent.obtain(event)
                childEvent.setLocation(childX, childY)
                
                if (isTouchOnClickableChild(child, childEvent)) {
                    childEvent.recycle()
                    return true
                }
                childEvent.recycle()
            }
        }

        return false
    }

    /**
     * Swipe direction enum.
     */
    private enum class SwipeDirection {
        UP, LEFT, RIGHT
    }

    /**
     * Create the snackbar view layout programmatically.
     */
    private fun createSnackbarView(
        activity: Activity,
        message: String,
        actionLabel: String?,
        action: (() -> Unit)?
    ): View {
        // Container with dark background (similar to Snackbar)
        val container = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor(SNACKBAR_BACKGROUND_COLOR))
            elevation = 8f
            setPadding(
                dpToPx(activity, 16),
                dpToPx(activity, 12),
                dpToPx(activity, 8),
                dpToPx(activity, 12)
            )

            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.TOP
            }
        }

        // Message text
        val messageText = TextView(activity).apply {
            text = message
            setTextColor(Color.WHITE)
            textSize = 14f
            layoutParams = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
            ).apply {
                gravity = Gravity.CENTER_VERTICAL
            }
            contentDescription = message // Accessibility support
        }

        container.addView(messageText)

        // Optional action button
        if (actionLabel != null && action != null) {
            val actionButton = Button(activity).apply {
                text = actionLabel
                setTextColor(Color.parseColor(ACTION_BUTTON_COLOR)) // Light blue
                background = null // Borderless button
                textSize = 14f
                isAllCaps = true
                setPadding(
                    dpToPx(activity, 16),
                    dpToPx(activity, 8),
                    dpToPx(activity, 16),
                    dpToPx(activity, 8)
                )
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.CENTER_VERTICAL
                }
                contentDescription = actionLabel // Accessibility support

                setOnClickListener {
                    try {
                        // メインスレッドの処理を軽くするため、ポストして実行する
                        it.post {
                            action.invoke()
                        }
                        dismissWithAnimation()
                    } catch (e: Exception) {
                        Timber.e(e, "Error executing TopSnackbar action")
                    }
                }
            }

            container.addView(actionButton)
        }

        return container
    }

    /**
     * Convert dp to pixels.
     */
    private fun dpToPx(activity: Activity, dp: Int): Int {
        val density = activity.resources.displayMetrics.density
        return (dp * density).toInt()
    }
}
