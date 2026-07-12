import sys
file_path = sys.argv[1]
with open(file_path, 'r') as f:
    content = f.read()

old_sig = 'fun initializeTTS(sampleRate: Double, channels: Int, modelId: String) {'
new_sig = 'fun initializeTTS(sampleRate: Double, channels: Int, modelId: String, promise: Promise) {\n        thread {\n            try {'

old_end = '''        // Start the audio player
        realTimeAudioPlayer?.start()
    }'''
new_end = '''        // Start the audio player
        realTimeAudioPlayer?.start()

        reactContext.runOnUiQueueThread {
            promise.resolve("TTS initialized")
        }
    } catch (e: Exception) {
        reactContext.runOnUiQueueThread {
            promise.reject("INIT_ERROR", "Failed to initialize TTS: ${e.message}", e)
        }
    }
        }
    }'''

if old_sig not in content:
    print('  [ERROR] initializeTTS signature not found!')
    sys.exit(1)
if old_end not in content:
    print('  [ERROR] initializeTTS end not found!')
    sys.exit(1)

content = content.replace(old_sig, new_sig)
content = content.replace(old_end, new_end)

with open(file_path, 'w') as f:
    f.write(content)
print('  [OK] initializeTTS patched: sync -> Promise + background thread')
