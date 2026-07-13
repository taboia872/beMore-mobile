# Be More Agent — BMO Companion

Assistente conversacional offline-first para Android. Interação 100% por voz, sem texto, sem configurações expostas. Pensado para uso por criança — system prompt gentil, sem tools, sem navegador, sem entrada manual.

## Pipeline

```
Wake Word / PTT → STT (Whisper) → LLM (llama.cpp) → TTS (Piper) → Speaker
```

Tudo local. Zero cloud. Zero telemetria.

## Stack

| Camada | Tecnologia | Lib |
|--------|-----------|-----|
| Framework | React Native 0.76.7 | Old Arch (newArchEnabled=false) |
| LLM | llama.cpp | llama.rn 0.9.0 |
| STT | whisper.cpp | whisper.rn 0.6.0 |
| TTS | Piper VITS | sherpa-onnx-offline-tts 0.2.6 |
| Áudio | AudioRecord → WAV/PCM | Nativo Kotlin (PcmRecorderModule) |
| Filesystem | RNFS | react-native-fs 2.20.0 |

## Build

CI via GitHub Actions. Push para `main` → APK na aba Actions → Artifacts.

```yaml
# .github/workflows/android-build.yml
# Node 20.19.4 / JDK 17 / Android SDK 35 / NDK 27.1 / CMake 3.22
# Pré-bundle JS → assembleDebug
```

## Estrutura

```
src/
├── App.tsx                  # Entry point + navegação
├── screens/
│   ├── ChatScreen.tsx       # UI principal (face BMO + PTT)
│   └── DownloadScreen.tsx   # Download de modelos locais
├── components/              # ChatBubble, ModelSelector, TtsCard, VoiceButton
├── services/
│   ├── LlamaService.ts      # LLM local (initLlama, streaming completion)
│   ├── WhisperService.ts    # STT (initWhisper, transcribe)
│   ├── TtsService.ts        # TTS (download + sherpa-onnx)
│   └── DownloadManager.ts   # Gestão de downloads de modelos
├── data/
│   ├── models.ts            # Catálogo de modelos LLM
│   └── whisperModels.ts    # Catálogo de modelos STT
└── types/index.ts

android/app/src/main/java/com/bmoreagent/
├── MainActivity.kt
├── MainApplication.kt
├── PcmRecorderModule.kt     # Gravação PCM 16-bit 16kHz mono → WAV
└── PcmRecorderPackage.kt    # Registry do módulo nativo

patches/
└── TTSManagerModule.kt      # Patch Kotlin para sherpa-onnx TTS
```

## Status

- [x] Fase 0: Setup (RN 0.76, Old Arch, CI)
- [x] Fase 1: Tela de Download de Modelos
- [x] Fase 3: LLM Engine (llama.rn 0.9.0)
- [x] Fase 4: STT (whisper.rn 0.6.0, PCM/WAV nativo)
- [x] Fase 4: TTS (Piper via sherpa-onnx, assets hospedados em GitHub Release)
- [x] Pipeline STT → LLM → TTS testado no device (Xiaomi 8GB)
- [ ] Fase 2: Face BMO animada
- [ ] Fase 7: Wake Word (OpenWakeWord)

## Assets TTS

Modelos TTS hospedados em GitHub Release (download individual, sem descompressão):

| Arquivo | Tamanho |
|---------|---------|
| en_US-amy-low.onnx | ~60MB |
| tokens.txt | ~1KB |
| en_US-amy-low.onnx.json | ~2KB |
| espeak-ng-data.zip | 8.6MB |

Release: `tts-voice-assets`

## Hardware Alvo

Xiaomi 8GB RAM. Modelos otimizados para rodar dentro do heap limitado do Android (~256MB/app).

---

Repo gêmeo: [taboia872/beMore-agent](https://github.com/taboia872/beMore-agent) — versão com Action Router e tools para uso pessoal.
