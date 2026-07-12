#!/usr/bin/env python3
"""
Single unified patch script for TTSManagerModule.kt
Applies all patches to the ORIGINAL file from npm in one pass.

Patches:
  1. Convert initializeTTS from sync to Promise + background thread
  2. Insert extractZip method (java.util.zip.ZipInputStream — native, no Apache Commons)
  3. Add Log import
"""
import sys

if len(sys.argv) < 2:
    print("Usage: apply_patches_kotlin.py <path_to_TTSManagerModule.kt>")
    sys.exit(1)

file_path = sys.argv[1]
with open(file_path, "r") as f:
    content = f.read()

modified = False

# --- PATCH 1b: Add Log import if missing ---
if 'import android.util.Log' not in content:
    content = content.replace(
        'import org.json.JSONObject',
        'import org.json.JSONObject\nimport android.util.Log'
    )
    modified = True
    print("  [OK] Patch 1b: Added Log import")

# --- PATCH 1: initializeTTS sync -> Promise + thread{} ---
OLD_SIG = '    fun initializeTTS(sampleRate: Double, channels: Int, modelId: String) {'
NEW_SIG = '    fun initializeTTS(sampleRate: Double, channels: Int, modelId: String, promise: Promise) {\n        thread {\n            try {'

OLD_END = """        // Start the audio player
        realTimeAudioPlayer?.start()
    }

    // Generate and Play method exposed to React Native"""

NEW_END = """        // Start the audio player
        realTimeAudioPlayer?.start()

                reactContext.runOnUiQueueThread {
                    promise.resolve("TTS initialized")
                }
            } catch (e: Exception) {
                Log.e("TTSManager", "initializeTTS failed: ${e.message}", e)
                reactContext.runOnUiQueueThread {
                    promise.reject("INIT_ERROR", "Failed to initialize TTS: ${e.message}", e)
                }
            }
        }
    }

    // Generate and Play method exposed to React Native"""

if OLD_SIG in content and OLD_END in content:
    content = content.replace(OLD_SIG, NEW_SIG)
    content = content.replace(OLD_END, NEW_END)
    modified = True
    print("  [OK] Patch 1: initializeTTS sync -> Promise + background thread")
elif 'fun initializeTTS(sampleRate: Double, channels: Int, modelId: String, promise: Promise)' in content:
    print("  [SKIP] Patch 1: initializeTTS already patched")
else:
    print("  [WARN] Patch 1: initializeTTS signature not found")

# --- PATCH 2: Insert extractZip (java.util.zip.ZipInputStream — NATIVE, no Apache Commons) ---
EXTRACT_METHOD = '''    // Extract .zip archive to destination directory
    // Uses java.util.zip.ZipInputStream (native Android — no Apache Commons dependency)
    @ReactMethod
    fun extractZip(zipPath: String, destDir: String, promise: Promise) {
        thread {
            try {
                val zipFile = File(zipPath)
                if (!zipFile.exists()) {
                    throw IOException("Zip not found: $zipPath")
                }

                Log.i("TTSManager", "Extracting zip: $zipPath -> $destDir")

                val destination = File(destDir)
                if (!destination.exists()) {
                    destination.mkdirs()
                }

                java.io.FileInputStream(zipFile).use { fis ->
                    java.util.zip.ZipInputStream(fis).use { zis ->
                        var entry = zis.nextEntry
                        var count = 0
                        while (entry != null) {
                            if (!entry.isDirectory) {
                                val outFile = File(destination, entry.name)
                                outFile.parentFile?.mkdirs()
                                java.io.FileOutputStream(outFile).use { fos ->
                                    val buffer = ByteArray(8192)
                                    var len: Int
                                    while (true) {
                                        len = zis.read(buffer)
                                        if (len == -1) break
                                        fos.write(buffer, 0, len)
                                    }
                                }
                                count++
                                Log.i("TTSManager", "Extracted ($count): ${entry.name}")
                            }
                            entry = zis.nextEntry
                        }
                    }
                }

                Log.i("TTSManager", "Zip extraction complete: $count files to $destDir")

                reactContext.runOnUiQueueThread {
                    promise.resolve(destDir)
                }
            } catch (e: Exception) {
                Log.e("TTSManager", "Zip extraction FAILED: ${e.message}", e)
                reactContext.runOnUiQueueThread {
                    promise.reject("EXTRACT_ERROR", "Failed to extract zip: ${e.message}", e)
                }
            }
        }
    }

'''

# Insert before generateAndPlay
MARKER = "    // Generate and Play method exposed to React Native"
if 'fun extractZip' not in content:
    if MARKER in content:
        content = content.replace(MARKER, EXTRACT_METHOD + MARKER)
        modified = True
        print("  [OK] Patch 2: extractZip inserted before generateAndPlay")
    else:
        print("  [ERROR] Patch 2: Marker 'generateAndPlay' not found!")
        sys.exit(1)
else:
    print("  [SKIP] Patch 2: extractZip already present")

if modified:
    with open(file_path, "w") as f:
        f.write(content)
    print("  [DONE] All patches applied to TTSManagerModule.kt")
else:
    print("  [DONE] No changes needed — all patches already applied")
