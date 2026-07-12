import sys

file_path = sys.argv[1]
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add Log import if not present
if 'import android.util.Log' not in content:
    content = content.replace(
        'import com.facebook.react.bridge.Promise',
        'import android.util.Log\nimport com.facebook.react.bridge.Promise'
    )
    print('[OK] Added Log import')

# 2. Add Log.e to extractTarBz2 catch
old_extract_catch = """            } catch (e: Exception) {
                reactContext.runOnUiQueueThread {
                    promise.reject("EXTRACT_ERROR", "Failed to extract archive: ${e.message}", e)
                }
            }"""
new_extract_catch = """            } catch (e: Exception) {
                Log.e("TTSManager", "extractTarBz2 FAILED", e)
                reactContext.runOnUiQueueThread {
                    promise.reject("EXTRACT_ERROR", "Failed to extract archive: ${e.message}", e)
                }
            }"""
if old_extract_catch in content:
    content = content.replace(old_extract_catch, new_extract_catch)
    print('[OK] Added Log.e to extractTarBz2 catch')

# 3. Add Log to initializeTTS
# Check if initializeTTS has thread + try (patched version)
if 'fun initializeTTS(sampleRate: Double, channels: Int, modelId: String, promise: Promise)' in content:
    old_init_catch = """    } catch (e: Exception) {
        reactContext.runOnUiQueueThread {
            promise.reject("INIT_ERROR", "Failed to initialize TTS: ${e.message}", e)
        }
    }"""
    new_init_catch = """    } catch (e: Exception) {
        Log.e("TTSManager", "initializeTTS FAILED", e)
        reactContext.runOnUiQueueThread {
            promise.reject("INIT_ERROR", "Failed to initialize TTS: ${e.message}", e)
        }
    }"""
    if old_init_catch in content:
        content = content.replace(old_init_catch, new_init_catch)
        print('[OK] Added Log.e to initializeTTS catch')
    else:
        print('[WARN] initializeTTS catch pattern not found')
    
    # Add Log.i before OfflineTts(config)
    old_offline = '        // Initialize sherpa-onnx offline TTS\n        tts = OfflineTts(config=config)'
    new_offline = '        // Initialize sherpa-onnx offline TTS\n        Log.i("TTSManager", "initializeTTS: loading model from $modelPath")\n        tts = OfflineTts(config=config)\n        Log.i("TTSManager", "initializeTTS: model loaded OK")'
    if old_offline in content:
        content = content.replace(old_offline, new_offline)
        print('[OK] Added Log.i to OfflineTts load')
else:
    print('[WARN] initializeTTS not patched with Promise — skipping')

with open(file_path, 'w') as f:
    f.write(content)
print('[DONE] Logging patches applied')
