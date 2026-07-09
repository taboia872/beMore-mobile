# Be More Agent — Android

Agent local offline-first para Android. Port do projeto [brenpoly/be-more-agent](https://github.com/brenpoly/be-more-agent) (Python/Tkinter/Ollama) para React Native.

## Stack
- React Native 0.76+ (New Architecture)
- llama.rn (LLM local via llama.cpp)
- onnxruntime-react-native (STT Whisper + Wake Word)
- Piper ONNX (TTS via bridge nativa Kotlin)
- DuckDuckGo (web search)

## Build
Este projeto usa GitHub Actions para compilar o APK na nuvem.
1. Faça push para `main` ou `dev`
2. O workflow `.github/workflows/android-build.yml` compila automaticamente
3. Baixe o APK na aba Actions → Artifacts

## Estrutura
```
src/
├── App.tsx              # Entry point
├── screens/             # Telas (download, chat, config)
├── components/          # UI (faces, HUD, PTT)
├── providers/           # LLMProvider (local/cloud)
├── tools/               # Action Router + ferramentas
├── types/               # TypeScript types
└── utils/               # Helpers
android/app/src/main/java/com/bmoreagent/
├── MainActivity.kt
├── MainApplication.kt
├── tts/                 # PiperTTSModule (Fase 5)
└── service/             # WakeWordService (Fase 7)
```

## Fases
- [x] Fase 0: Setup
- [ ] Fase 1: Tela de Download de Modelos
- [ ] Fase 2: Interface e Máquina de Estados
- [ ] Fase 3: LLM Engine
- [ ] Fase 4: STT (Whisper)
- [ ] Fase 5: TTS (Piper)
- [ ] Fase 6: Action Router
- [ ] Fase 7: Wake Word
- [ ] Fase 8: Memória e Config
