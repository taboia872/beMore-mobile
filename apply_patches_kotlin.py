#!/usr/bin/env python3
"""
Single unified patch script for TTSManagerModule.kt
Applies all patches to the ORIGINAL file from npm in one pass.
Patches:
  1. Convert initializeTTS from sync to Promise + background thread
  2. Insert extractTarBz2 method before generateAndPlay
  3. Add logging to catch blocks
"""
import sys

if len(sys.argv) < 2:
    print("Usage: apply_patches_kotlin.py <path_to_TTSManagerModule.kt>")
    sys.exit(1)

file_path = sys.argv[1]
with open(file_path, "r") as f:
    content = f.read()

modified = False

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
    print("  [WARN] Patch 1: initializeTTS signature not found - may already be patched")
    # Continue anyway - file might already be partially patched

# --- PATCH 1b: Add Log import if missing ---
if 'import android.util.Log' not in content:
    content = content.replace(
        'import org.json.JSONObject',
        'import org.json.JSONObject\nimport android.util.Log'
    )
    modified = True
    print("  [OK] Patch 1b: Added Log import")

# --- PATCH 2: Insert extractTarBz2 before generateAndPlay ---
EXTRACT_METHOD = '''    // Extract .tar.bz2 archive to destination directory
    // Uses Apache Commons Compress for robust tar.bz2 extraction
    @ReactMethod
    fun extractTarBz2(archivePath: String, destDir: String, promise: Promise) {
        thread {
            try {
                val archiveFile = File(archivePath)
                if (!archiveFile.exists()) {
                    throw IOException("Archive not found: $archivePath")
                }

                Log.i("TTSManager", "Extracting: $archivePath -> $destDir")

                val destination = File(destDir)
                if (!destination.exists()) {
                    destination.mkdirs()
                }

                val fis = java.io.FileInputStream(archiveFile)
                val bzIn = org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream(fis)
                val tarIn = org.apache.commons.compress.archivers.tar.TarArchiveInputStream(bzIn)

                var entry: org.apache.commons.compress.archivers.tar.TarArchiveEntry? = tarIn.nextEntry
                Log.i("TTSManager", "Starting tar extraction loop")
                var count = 0
                while (entry != null) {
                    if (!entry.isDirectory) {
                        val outFile = File(destination, entry.name)
                        outFile.parentFile?.mkdirs()
                        java.io.FileOutputStream(outFile).use { fos ->
                            val buffer = ByteArray(8192)
                            var len: Int
                            while (true) {
                                len = tarIn.read(buffer)
                                if (len == -1) break
                                fos.write(buffer, 0, len)
                            }
                        }
                        count++
                        Log.i("TTSManager", "Extracted ($count): ${entry.name}")
                    }
                    entry = tarIn.nextEntry
                }

                tarIn.close()
                bzIn.close()
                fis.close()

                Log.i("TTSManager", "Extraction complete: $count files extracted to $destDir")

                reactContext.runOnUiQueueThread {
                    promise.resolve(destDir)
                }
            } catch (e: Exception) {
                Log.e("TTSManager", "Extraction FAILED: ${e.message}", e)
                reactContext.runOnUiQueueThread {
                    promise.reject("EXTRACT_ERROR", "Failed to extract archive: ${e.message}", e)
                }
            }
        }
    }

'''

# Insert before generateAndPlay
MARKER = "    // Generate and Play method exposed to React Native"
if 'fun extractTarBz2' not in content:
    if MARKER in content:
        content = content.replace(MARKER, EXTRACT_METHOD + MARKER)
        modified = True
        print("  [OK] Patch 2: extractTarBz2 inserted before generateAndPlay")
    else:
        print("  [ERROR] Patch 2: Marker 'generateAndPlay' not found!")
        sys.exit(1)
else:
    print("  [SKIP] Patch 2: extractTarBz2 already present")

# --- PATCH 3: Add logging to extractTarBz2 and initializeTTS catches ---
# Already handled inline in patches 1 and 2 above
# This patch is now redundant - keeping for compatibility
print("  [OK] Patch 3: Logging already integrated in patches 1+2")

if modified:
    with open(file_path, "w") as f:
        f.write(content)
    print("  [DONE] All patches applied to TTSManagerModule.kt")
else:
    print("  [DONE] No changes needed - all patches already applied")
