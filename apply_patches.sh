#!/bin/bash
set -e
echo "Applying patches to react-native-sherpa-onnx-offline-tts..."

LIB_DIR="node_modules/react-native-sherpa-onnx-offline-tts"
LIB_GRADLE="$LIB_DIR/android/build.gradle"
LIB_KOTLIN="$LIB_DIR/android/src/main/java/com/sherpaonnxofflinetts/TTSManagerModule.kt"
SNIPPET_FILE="apply_patches.kt_snippet"

# 1. Patch build.gradle: add commons-compress dependency
if grep -q "commons-compress" "$LIB_GRADLE" 2>/dev/null; then
  echo "  [SKIP] commons-compress already in build.gradle"
else
  sed -i "/implementation files('libs\/sherpa-onnx-1.10.35.aar')/a\\  implementation 'org.apache.commons:commons-compress:1.26.1'" "$LIB_GRADLE"
  echo "  [OK] Added commons-compress to build.gradle"
fi

# 2. Patch TTSManagerModule.kt: add extractTarBz2 method
if grep -q "extractTarBz2" "$LIB_KOTLIN" 2>/dev/null; then
  echo "  [SKIP] extractTarBz2 already in TTSManagerModule.kt"
else
  if [ ! -f "$SNIPPET_FILE" ]; then
    echo "  [ERROR] Snippet file $SNIPPET_FILE not found!"
    exit 1
  fi
  python3 -c "
import sys
file_path = '$LIB_KOTLIN'
snippet_path = '$SNIPPET_FILE'
with open(file_path, 'r') as f:
    content = f.read()
with open(snippet_path, 'r') as f:
    method_code = f.read()
marker = \"    @ReactMethod\n    fun generateAndSave\"
idx = content.find(marker)
if idx == -1:
    print('  [ERROR] Marker not found in TTSManagerModule.kt')
    sys.exit(1)
new_content = content[:idx] + method_code + content[idx:]
with open(file_path, 'w') as f:
    f.write(new_content)
print('  [OK] extractTarBz2 inserted into TTSManagerModule.kt')
"
fi

echo "Patches applied successfully!"
