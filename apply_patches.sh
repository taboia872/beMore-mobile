#!/bin/bash
set -e
echo "Applying patches to react-native-sherpa-onnx-offline-tts..."

LIB_DIR="node_modules/react-native-sherpa-onnx-offline-tts"
LIB_GRADLE="$LIB_DIR/android/build.gradle"
LIB_KOTLIN="$LIB_DIR/android/src/main/java/com/sherpaonnxofflinetts/TTSManagerModule.kt"

# 1. Patch build.gradle: compileOnly instead of implementation (no commons-compress needed — ZipInputStream is native)
if grep -q "^  compileOnly files('libs/sherpa-onnx-1.10.35.aar')" "$LIB_GRADLE" 2>/dev/null; then
  echo "  [SKIP] build.gradle already patched (compileOnly active)"
else
  sed -i "s|^  implementation files('libs/sherpa-onnx-1.10.35.aar')|  compileOnly files('libs/sherpa-onnx-1.10.35.aar')|" "$LIB_GRADLE"
  echo "  [OK] Replaced implementation -> compileOnly for sherpa-onnx .aar"
fi

# 2. Patch TTSManagerModule.kt: ALL Kotlin patches in one unified script
#    (initializeTTS async+Promise, extractZip via native ZipInputStream, logging)
python3 apply_patches_kotlin.py "$LIB_KOTLIN"

echo "Patches applied successfully!"
