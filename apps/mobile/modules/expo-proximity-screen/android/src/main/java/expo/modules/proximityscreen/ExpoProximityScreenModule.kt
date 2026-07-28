package expo.modules.proximityscreen

import android.content.Context
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoProximityScreenModule : Module() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoProximityScreen")

    Function("acquire") {
      acquireWakeLock()
    }

    Function("release") {
      releaseWakeLock()
    }

    OnDestroy {
      releaseWakeLock()
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return

    val powerManager = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager
      ?: return

    val lock = powerManager.newWakeLock(
      PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
      "OpenChat:proximity-voice-call"
    )
    // Don't set reference counts — a single acquire/release cycle per call.
    lock.setReferenceCounted(false)
    lock.acquire()
    wakeLock = lock
  }

  private fun releaseWakeLock() {
    val lock = wakeLock ?: return
    wakeLock = null
    if (lock.isHeld) {
      lock.release()
    }
  }
}
