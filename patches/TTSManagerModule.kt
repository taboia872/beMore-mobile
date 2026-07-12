package com.sherpaonnxofflinetts

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.k2fsa.sherpa.onnx.*
import android.content.res.AssetManager
import kotlin.concurrent.thread
import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import org.json.JSONObject
import android.util.Log

class ModelLoader(private val context: Context) {

    @Throws(IOException::class)
    fun loadModelFromAssets(assetPath: String, outputFileName: String): String {
        val assetManager = context.assets
        val inputStream = assetManager.open(assetPath)
        val outFile = File(context.filesDir, outputFileName)
        FileOutputStream(outFile).use { output ->
            inputStream.copyTo(output)
        }
        inputStream.close()
        return outFile.absolutePath
    }

    @Throws(IOException::class)
    fun copyAssetDirectory(assetDir: String, outputDir: File) {
        val assetManager = context.assets
        val files = assetManager.list(assetDir) ?: return

        if (!outputDir.exists()) {
            outputDir.mkdirs()
        }

        for (file in files) {
            val assetPath = if (assetDir.isEmpty()) file else "$assetDir/$file"
            val outFile = File(outputDir, file)

            if (assetManager.list(assetPath)?.isNotEmpty() == true) {
                copyAssetDirectory(assetPath, outFile)
            } else {
                assetManager.open(assetPath).use { inputStream ->
                    FileOutputStream(outFile).use { outputStream ->
                        inputStream.copyTo(outputStream)
                    }
                }
            }
        }
    }
}


class TTSManagerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var tts: OfflineTts? = null
    private var realTimeAudioPlayer: AudioPlayer? = null
    private val modelLoader = ModelLoader(reactContext)
    private var playbackSeq: Int = 0
    @Volatile private var activePlaybackId: Int = 0
    @Volatile private var stopping = false
    private var pendingPromise: Promise? = null

    override fun getName(): String {
        return "TTSManager"
    }

    // Initialize TTS and Audio Player (async via thread + Promise)
    @ReactMethod
    fun initializeTTS(sampleRate: Double, channels: Int, modelId: String, promise: Promise) {
        thread {
            try {
                // Setup Audio Player
                realTimeAudioPlayer = AudioPlayer(sampleRate.toInt(), channels, object : AudioPlayerDelegate {
                    override fun didUpdateVolume(volume: Float) {
                        sendVolumeUpdate(volume)

                        if (volume == -1f) {
                            if (stopping) return

                            val p = pendingPromise
                            pendingPromise = null
                            p?.resolve("Playback finished")
                        }
                    }
                })

                val jsonObject = JSONObject(modelId)
                val modelPath = jsonObject.getString("modelPath")
                val tokensPath = jsonObject.getString("tokensPath")
                val dataDirPath = jsonObject.getString("dataDirPath")

                val config = OfflineTtsConfig(
                    model=OfflineTtsModelConfig(
                      vits=OfflineTtsVitsModelConfig(
                        model=modelPath,
                        tokens=tokensPath,
                        dataDir=dataDirPath,
                      ),
                      numThreads=1,
                      debug=true,
                    )
                  )

                tts = OfflineTts(config=config)
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

    // Extract .zip archive to destination directory (native java.util.zip — no Apache Commons)
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

                var fileCount = 0
                java.io.FileInputStream(zipFile).use { fis ->
                    java.util.zip.ZipInputStream(fis).use { zis ->
                        var entry = zis.nextEntry
                        while (entry != null) {
                            if (!entry.isDirectory) {
                                val outFile = File(destination, entry.name)
                                outFile.parentFile?.mkdirs()
                                java.io.FileOutputStream(outFile).use { fos ->
                                    val buffer = ByteArray(8192)
                                    while (true) {
                                        val len = zis.read(buffer)
                                        if (len == -1) break
                                        fos.write(buffer, 0, len)
                                    }
                                }
                                fileCount++
                                Log.i("TTSManager", "Extracted ($fileCount): ${entry.name}")
                            }
                            entry = zis.nextEntry
                        }
                    }
                }

                Log.i("TTSManager", "Zip extraction complete: $fileCount files to $destDir")

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

    // Generate and Play method exposed to React Native
    @ReactMethod
    fun generateAndPlay(text: String, sid: Int, speed: Double, promise: Promise) {
        val trimmedText = text.trim()
        if (trimmedText.isEmpty()) {
            promise.reject("EMPTY_TEXT", "Input text is empty")
            return
        }

        val player = realTimeAudioPlayer
        val engine = tts
        if (player == null || engine == null) {
            promise.reject("NOT_INITIALIZED", "TTS is not initialized")
            return
        }

        pendingPromise?.resolve("Interrupted")
        pendingPromise = promise

        playbackSeq += 1
        val playbackId = playbackSeq
        activePlaybackId = playbackId

        player.beginPlayback(playbackId)

        try {
            val sentences = splitText(trimmedText, 15)
            for (sentence in sentences) {
                val processedSentence = if (sentence.endsWith(".")) sentence else "$sentence."
                generateAudio(processedSentence, sid, speed.toFloat())
            }
            player.endEnqueue()
        } catch (e: Exception) {
            pendingPromise = null
            promise.reject("GENERATION_ERROR", "Error during audio generation: ${e.message}")
        }
    }


    // Deinitialize method exposed to React Native
    @ReactMethod
    fun deinitialize() {
        stopping = true

        pendingPromise?.resolve("Playback stopped")
        pendingPromise = null

        realTimeAudioPlayer?.stopPlayer()
        realTimeAudioPlayer = null

        tts?.release()
        tts = null

        stopping = false
    }

    @ReactMethod
    fun generateAndSave(text: String, path: String?, fileType: String?, promise: Promise) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) {
            promise.reject("EMPTY_TEXT", "Input text is empty")
            return
        }

        val engine = tts
        if (engine == null) {
            promise.reject("NOT_INITIALIZED", "TTS is not initialized")
            return
        }

        val ft = (fileType ?: "wav").lowercase()
        if (ft != "wav") {
            promise.reject("UNSUPPORTED_FILETYPE", "Only wav is supported right now")
            return
        }

        thread {
            try {
                val sentences = splitText(trimmed, 15)
                val all = ArrayList<Float>(22050 * 10)

                var sr = 22050
                val ch = 1

                for (s in sentences) {
                    val processed = if (s.endsWith(".")) s else "$s."
                    val audio = engine.generate(processed, 0, 1.0f)
                        ?: throw IllegalStateException("Audio generation failed")
                    sr = audio.sampleRate
                    all.addAll(audio.samples.asList())
                }

                val outFile = resolveOutputFile(path, "wav")
                writeWavPCM16(outFile, all.toFloatArray(), sr, ch)

                reactContext.runOnUiQueueThread {
                    promise.resolve(outFile.absolutePath)
                }
            } catch (e: Exception) {
                reactContext.runOnUiQueueThread {
                    promise.reject("SAVE_ERROR", e.message, e)
                }
            }
        }
    }


    // Helper: split text into manageable chunks
    private fun splitText(text: String, maxWords: Int): List<String> {
        val sentences = mutableListOf<String>()
        val words = text.split("\\s+".toRegex()).filter { it.isNotEmpty() }
        var currentIndex = 0
        val totalWords = words.size

        while (currentIndex < totalWords) {
            val endIndex = (currentIndex + maxWords).coerceAtMost(totalWords)
            var chunk = words.subList(currentIndex, endIndex).joinToString(" ")

            val lastPeriod = chunk.lastIndexOf('.')
            val lastComma = chunk.lastIndexOf(',')

            when {
                lastPeriod != -1 -> {
                    val sentence = chunk.substring(0, lastPeriod + 1).trim()
                    sentences.add(sentence)
                    currentIndex += sentence.split("\\s+".toRegex()).size
                }
                lastComma != -1 -> {
                    val sentence = chunk.substring(0, lastComma + 1).trim()
                    sentences.add(sentence)
                    currentIndex += sentence.split("\\s+".toRegex()).size
                }
                else -> {
                    sentences.add(chunk.trim())
                    currentIndex += maxWords
                }
            }
        }

        return sentences
    }

    private fun generateAudio(text: String, sid: Int, speed: Float) {
        val startTime = System.currentTimeMillis()
        val audio = tts?.generate(text, sid, speed)
        val endTime = System.currentTimeMillis()
        val generationTime = (endTime - startTime) / 1000.0
        println("Time taken for TTS generation: $generationTime seconds")

        if (audio == null) {
            println("Error: TTS was never initialized or audio generation failed")
            return
        }
        realTimeAudioPlayer?.enqueueAudioData(audio.samples, audio.sampleRate)
    }

    private fun sendVolumeUpdate(volume: Float) {
        if (reactContext.hasActiveCatalystInstance()) {
            val params = Arguments.createMap()
            params.putDouble("volume", volume.toDouble())
            println("kislaytest: Volume Update: $volume")
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("VolumeUpdate", params)
        }
    }

    private fun resolveOutputFile(path: String?, ext: String): File {
        fun defaultFile(): File =
            File(reactContext.cacheDir, "tts_${System.currentTimeMillis()}.$ext")

        if (path.isNullOrBlank()) return defaultFile()

        val f = File(path)
        val target = if (f.isAbsolute) f else File(reactContext.filesDir, path)

        return if (target.name.endsWith(".$ext", ignoreCase = true)) {
            target.parentFile?.mkdirs()
            target
        } else {
            target.mkdirs()
            File(target, "tts_${System.currentTimeMillis()}.$ext")
        }
    }

    private fun writeWavPCM16(out: File, floatSamples: FloatArray, sampleRate: Int, channels: Int) {
        out.parentFile?.mkdirs()

        val pcm = ByteArray(floatSamples.size * 2)
        var i = 0
        for (f in floatSamples) {
            val c = f.coerceIn(-1f, 1f)
            val s = (c * 32767f).toInt().toShort()
            pcm[i++] = (s.toInt() and 0xFF).toByte()
            pcm[i++] = ((s.toInt() shr 8) and 0xFF).toByte()
        }

        val byteRate = sampleRate * channels * 2
        val blockAlign = (channels * 2).toShort()
        val dataSize = pcm.size
        val riffSize = 36 + dataSize

        FileOutputStream(out).use { os ->
            fun wStr(s: String) = os.write(s.toByteArray(Charsets.US_ASCII))
            fun wI32(v: Int) = os.write(byteArrayOf(
                (v and 0xFF).toByte(),
                ((v shr 8) and 0xFF).toByte(),
                ((v shr 16) and 0xFF).toByte(),
                ((v shr 24) and 0xFF).toByte()
            ))
            fun wI16(v: Short) = os.write(byteArrayOf(
                (v.toInt() and 0xFF).toByte(),
                ((v.toInt() shr 8) and 0xFF).toByte()
            ))

            wStr("RIFF"); wI32(riffSize); wStr("WAVE")
            wStr("fmt "); wI32(16); wI16(1)
            wI16(channels.toShort())
            wI32(sampleRate)
            wI32(byteRate)
            wI16(blockAlign)
            wI16(16)
            wStr("data"); wI32(dataSize)
            os.write(pcm)
        }
    }
}
