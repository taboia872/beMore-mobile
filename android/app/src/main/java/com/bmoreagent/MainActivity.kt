package com.bmoreagent

import android.os.Bundle
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "be_more_agent"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setupImmersiveMode()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      setupImmersiveMode()
    }
  }

  private fun setupImmersiveMode() {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.apply {
      // Esconde status bar e navigation bar
      hide(WindowInsetsCompat.Type.systemBars())
      // Sticky behavior: swipes from edge temporarily show bars, then auto-hide
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
    // Layout content behind system bars for true fullscreen
    WindowCompat.setDecorFitsSystemWindows(window, false)
  }
}
