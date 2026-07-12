#!/bin/bash
set -e
echo "Applying patches to react-native-sherpa-onnx-offline-tts..."

LIB_DIR="node_modules/react-native-sherpa-onnx-offline-tts"
LIB_GRADLE="$LIB_DIR/android/build.gradle"
LIB_KOTLIN="$LIB_DIR/android/src/main/java/com/sherpaonnxofflinetts/TTSManagerModule.kt"
SNIPPET_FILE="apply_patches.kt_snippet"

# 1. Patch build.gradle: replace local .aar dep with compileOnly + add commons-compress
#    AGP 8.x rejects local .aar deps when building a library AAR.
#    The .aar is now referenced at app level (android/app/libs/ via flatDir).
#    Check for ACTIVE compileOnly (not commented out)
if grep -q "^  compileOnly files('libs/sherpa-onnx-1.10.35.aar')" "$LIB_GRADLE" 2>/dev/null; then
  echo "  [SKIP] build.gradle already patched (compileOnly active)"
else
  # Replace: implementation files('libs/sherpa-onnx-1.10.35.aar')
  # With:    compileOnly files('libs/sherpa-onnx-1.10.35.aar')
  sed -i "s|^  implementation files('libs/sherpa-onnx-1.10.35.aar')|  compileOnly files('libs/sherpa-onnx-1.10.35.aar')|" "$LIB_GRADLE"
  echo "  [OK] Replaced implementation -> compileOnly for sherpa-onnx .aar"

  # Add commons-compress if not present (active, not commented)
  if ! grep -q "^  implementation 'org.apache.commons:commons-compress" "$LIB_GRADLE" 2>/dev/null; then
    sed -i "/^  compileOnly files('libs\/sherpa-onnx-1.10.35.aar')/a\\  implementation 'org.apache.commons:commons-compress:1.26.1'" "$LIB_GRADLE"
    echo "  [OK] Added commons-compress to build.gradle"
  else
    echo "  [SKIP] commons-compress already in build.gradle"
  fi
fi

# 2. Patch TTSManagerModule.kt: add extractTarBz2 method
if grep -q "fun extractTarBz2" "$LIB_KOTLIN" 2>/dev/null; then
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
