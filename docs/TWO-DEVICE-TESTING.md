# Two-Device Testing Rig

Real-time message delivery proof between two Android emulators running the
OpenChat release APK, signed in as Alice and Bob.

## Prerequisites

- Android SDK (API 34) with `system-images;android-34;google_apis;arm64-v8a`
- JDK 17 (`/opt/homebrew/opt/openjdk@17`)
- Shared dev stack running at `http://localhost:3030/api`
- APK built via `expo prebuild && cd android && ./gradlew assembleRelease`
- `$ANDROID_HOME/platform-tools` on PATH for `adb`

Source `tools/env.sh` before any command:

```bash
source tools/env.sh
```

## AVD Setup

Two identical Pixel 6a AVDs running API 34 with Google APIs:

```bash
# List AVDs — should show both
emulator -list-avds
# OpenChat_Pixel6a_API34
# OpenChat_Pixel6a_API34_B

# Create second AVD (if missing)
echo "no" | avdmanager create avd \
  -n OpenChat_Pixel6a_API34_B \
  -k "system-images;android-34;google_apis;arm64-v8a" \
  -d "pixel_6a"
```

## Booting Both Emulators

Start each emulator on a unique ADB port so they don't collide:

```bash
# Emulator A (Alice) — default ports 5554/5555
emulator -avd OpenChat_Pixel6a_API34 -no-snapshot -port 5554 &

# Emulator B (Bob) — explicit port 5556/5557
emulator -avd OpenChat_Pixel6a_API34_B -no-snapshot -port 5556 &

# Wait for both to boot (check bootanim has stopped on both)
adb -s emulator-5554 wait-for-device
adb -s emulator-5556 wait-for-device

# Verify both online
adb devices
# emulator-5554   device
# emulator-5556   device
```

## Installing the APK

```bash
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk

adb -s emulator-5554 install -r "$APK"
adb -s emulator-5556 install -r "$APK"
```

## Signing In

The dev-login screen has `testID="login-username"` (TextInput) and
`testID="login-submit"` (Pressable). We type the username then tap submit:

```bash
# Wake both screens
adb -s emulator-5554 shell input keyevent KEYCODE_WAKEUP
adb -s emulator-5556 shell input keyevent KEYCODE_WAKEUP

# Launch app on both
adb -s emulator-5554 shell am start -n com.openchat.mobile/.MainActivity
adb -s emulator-5556 shell am start -n com.openchat.mobile/.MainActivity

# Wait for login screen
sleep 3

# Alice on emulator-5554
adb -s emulator-5554 shell input text "alice"
adb -s emulator-5554 shell input keyevent KEYCODE_TAB
adb -s emulator-5554 shell input keyevent KEYCODE_ENTER

# Bob on emulator-5556
adb -s emulator-5556 shell input text "bob"
adb -s emulator-5556 shell input keyevent KEYCODE_TAB
adb -s emulator-5556 shell input keyevent KEYCODE_ENTER
```

## Real-Time Message Delivery Test

### Method

1. Both Alice and Bob must be in the same channel (e.g., `#general` in the
   fixture server).
2. Alice types a message. The message is sent via the WebSocket gateway.
3. Bob receives it via WebSocket push — no manual refresh, no polling.
4. Screenshots are captured on both devices at key moments.

### Script

```bash
# Ensure both are signed in and in #general channel
# (The fixture server 3ecbf3e9 has #general channel fdf0a948...)

# Capture Alice's pre-send screen
adb -s emulator-5554 shell screencap -p /sdcard/alice-pre-send.png
adb -s emulator-5554 pull /sdcard/alice-pre-send.png artifacts/e2e/screens/alice-pre-send.png

# Capture Bob's pre-receive screen
adb -s emulator-5556 shell screencap -p /sdcard/bob-pre-receive.png
adb -s emulator-5556 pull /sdcard/bob-pre-receive.png artifacts/e2e/screens/bob-pre-receive.png

# Alice types and sends a message
START_TIME=$(date +%s%3N)
adb -s emulator-5554 shell input text "Hello from Alice! Two-device test."
adb -s emulator-5554 shell input keyevent KEYCODE_ENTER

# Wait briefly for delivery
sleep 1

# Capture Bob's screen showing the received message
adb -s emulator-5556 shell screencap -p /sdcard/bob-received.png
adb -s emulator-5556 pull /sdcard/bob-received.png artifacts/e2e/screens/bob-received.png

# Capture Alice's post-send screen
adb -s emulator-5554 shell screencap -p /sdcard/alice-post-send.png
adb -s emulator-5554 pull /sdcard/alice-post-send.png artifacts/e2e/screens/alice-post-send.png
```

### Measuring Latency

```bash
# Send from Alice with timestamp in message content
MSG="perf-test-$(date +%s%3N)"
adb -s emulator-5554 shell input text "$MSG"
adb -s emulator-5554 shell input keyevent KEYCODE_ENTER

# Poll Bob's screen for the message text
# The delivery time = time message appears on B - time sent from A
```

### Expected Results

- Message typed by Alice appears on Bob's screen within < 500ms (LAN, no
  internet round-trip).
- No manual refresh required — proof of WebSocket real-time delivery.
- Both emulators remain signed in throughout.

## Troubleshooting

- **ADB unauthorized**: Run `adb kill-server && adb start-server` then
  reconnect.
- **Emulator won't boot**: Delete the AVD's `userdata-qemu.img` and
  `userdata-qemu.img.qcow2` files to force cold boot.
- **APK won't install**: Check that `apps/mobile/android/gradle.properties`
  has `android.useAndroidX=true`.
- **Login fails**: Verify the shared dev stack is running and reachable at
  `http://10.0.2.2:3030/api` from the emulator. Test with:
  ```bash
  adb -s emulator-5554 shell curl http://10.0.2.2:3030/api/health
  ```

## Screenshot Archive

Screenshots are stored in `artifacts/e2e/screens/`:
- `alice-pre-send.png` — Alice's view before sending
- `alice-post-send.png` — Alice's view after sending
- `bob-pre-receive.png` — Bob's view before message arrives
- `bob-received.png` — Bob's view showing the received message
