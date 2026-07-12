#!/usr/bin/env python3
"""
Patch script: replaces TTSManagerModule.kt with the full patched version.
No more fragile string replacement — deterministic file copy.

Changes in the patched version:
  1. initializeTTS is async (thread + Promise)
  2. extractZip method added (java.util.zip.ZipInputStream — native, no Apache Commons)
  3. Log import added
"""
import sys
import shutil
import os

if len(sys.argv) < 2:
    print("Usage: apply_patches_kotlin.py <path_to_TTSManagerModule.kt>")
    sys.exit(1)

target = sys.argv[1]
script_dir = os.path.dirname(os.path.abspath(__file__))
source = os.path.join(script_dir, "patches", "TTSManagerModule.kt")

if not os.path.exists(source):
    print(f"  [ERROR] Patch file not found: {source}")
    sys.exit(1)

shutil.copy2(source, target)
print(f"  [OK] Replaced {os.path.basename(target)} with patched version")
print(f"  [OK] Source: {source}")
