package com.mifinanzas.jarvis

import android.app.Activity
import android.Manifest
import android.content.pm.PackageManager
import android.speech.RecognizerIntent
import android.speech.RecognitionListener
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.Uri
import android.content.Intent
import android.widget.*
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val expectedBytes = 2_588_147_712L
    private val modelName = "gemma-4-E2B-it.litertlm"
    private val modelUrl = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/" + modelName
    private lateinit var status: TextView
    private lateinit var transcript: TextView
    private lateinit var prompt: EditText
    private lateinit var progress: ProgressBar
    private lateinit var downloadButton: Button
    private lateinit var loadButton: Button
    private lateinit var sendButton: Button
    private lateinit var openFinanceButton: Button
    private lateinit var webView: WebView
    private lateinit var rootLayout: LinearLayout
    private var fileChooserCallback: android.webkit.ValueCallback<Array<Uri>>? = null
    private val fileChooserRequest = 4107
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    private var busy = false
    private var speechRecognizer: SpeechRecognizer? = null
    private var textToSpeech: TextToSpeech? = null
    private var speechReady = false
    private var pendingListen = false
    private var voiceSessionActive = false
    private val voiceHandler = Handler(Looper.getMainLooper())
    private val voiceRetry = Runnable { if (voiceSessionActive) startVoiceRecognition() }
    private var voiceOutputDescription = "Voz española del dispositivo"
    private val audioPermissionRequest = 4108
    private val modelFile: File
        get() = File(getExternalFilesDir(null) ?: filesDir, modelName)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        initVoiceEngines()
        refreshModelState()
    }

    private fun buildUi() {
        rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 28, 24, 20)
            setBackgroundColor(0xFFF4F7F4.toInt())
        }
        val title = TextView(this).apply {
            text = "J.A.R.V.I.S. · Motor local"
            textSize = 23f
            setTextColor(0xFF173F36.toInt())
            gravity = Gravity.CENTER_VERTICAL
        }
        status = TextView(this).apply {
            text = "Comprobando almacenamiento…"
            textSize = 14f
            setPadding(0, 12, 0, 12)
            setTextColor(0xFF40564A.toInt())
        }
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
        }
        downloadButton = Button(this).apply {
            text = "Descargar Gemma 4 E2B-it (2,58 GB)"
            setOnClickListener { downloadModel() }
        }
        loadButton = Button(this).apply {
            text = "Cargar modelo"
            setOnClickListener { loadModel() }
        }
        openFinanceButton = Button(this).apply {
            text = "Abrir Mi Finanzas con J.A.R.V.I.S."
            isEnabled = false
            setOnClickListener { openFinance() }
        }
        transcript = TextView(this).apply {
            text = "Esta app de prueba ejecuta Gemma directamente en el teléfono.\n"
            textSize = 15f
            setTextColor(0xFF1C2923.toInt())
            setPadding(12, 12, 12, 12)
        }
        val scroll = ScrollView(this).apply { addView(transcript) }
        webView = WebView(this).apply {
            visibility = View.GONE
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            addJavascriptInterface(NativeJarvisBridge(), "AndroidJarvis")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val host = request.url.host ?: return true
                    if (host == "mi-finanzas-tbu1-personal-dcec.vercel.app") return false
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: android.webkit.ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = callback
                    return try {
                        startActivityForResult(params.createIntent(), fileChooserRequest)
                        true
                    } catch (e: Exception) {
                        fileChooserCallback = null
                        false
                    }
                }
            }
        }
        prompt = EditText(this).apply {
            hint = "Escribe una pregunta…"
            minLines = 2
            maxLines = 4
        }
        sendButton = Button(this).apply {
            text = "Enviar"
            isEnabled = false
            setOnClickListener { sendPrompt() }
        }
        rootLayout.addView(title)
        rootLayout.addView(status)
        rootLayout.addView(progress)
        rootLayout.addView(downloadButton)
        rootLayout.addView(loadButton)
        rootLayout.addView(openFinanceButton)
        rootLayout.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        rootLayout.addView(webView, LinearLayout.LayoutParams(-1, 0, 1f))
        rootLayout.addView(prompt)
        rootLayout.addView(sendButton)
        setContentView(rootLayout)
    }

    private fun refreshModelState() {
        val exists = modelFile.exists() && modelFile.length() == expectedBytes
        status.text = if (exists) "Modelo descargado y verificado." else "Descarga el modelo oficial (2,58 GB) para empezar."
        downloadButton.isEnabled = !exists && !busy
        loadButton.isEnabled = exists && !busy
    }

    private fun downloadModel() {
        if (busy) return
        val dir = modelFile.parentFile ?: filesDir
        if (dir.usableSpace < expectedBytes + 500_000_000L) {
            status.text = "No hay espacio suficiente. Libera al menos 3,1 GB."
            return
        }
        busy = true
        downloadButton.isEnabled = false
        loadButton.isEnabled = false
        progress.visibility = View.VISIBLE
        progress.progress = 0
        status.text = "Conectando con Hugging Face…"
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    dir.mkdirs()
                    val partial = File(dir, modelName + ".part")
                    val connection = URL(modelUrl).openConnection() as HttpURLConnection
                    connection.connectTimeout = 30000
                    connection.readTimeout = 60000
                    connection.instanceFollowRedirects = true
                    connection.setRequestProperty("User-Agent", "MiFinanzas-JARVIS-Android/0.1")
                    try {
                        connection.connect()
                        if (connection.responseCode !in 200..299) {
                            throw IllegalStateException("Hugging Face respondió HTTP " + connection.responseCode)
                        }
                        val total = connection.contentLengthLong.takeIf { it > 0 } ?: expectedBytes
                        connection.inputStream.use { input ->
                            partial.outputStream().buffered().use { output ->
                                val buffer = ByteArray(1024 * 1024)
                                var received = 0L
                                while (true) {
                                    val count = input.read(buffer)
                                    if (count < 0) break
                                    if (count == 0) continue
                                    output.write(buffer, 0, count)
                                    received += count
                                    val pct = ((received * 100) / total).toInt().coerceIn(0, 100)
                                    withContext(Dispatchers.Main) {
                                        progress.progress = pct
                                        status.text = "Descargando Gemma… " + pct + "%"
                                    }
                                }
                            }
                        }
                        if (partial.length() != expectedBytes) {
                            throw IllegalStateException("La descarga no coincide con el tamaño oficial. Se ha cancelado.")
                        }
                        if (!partial.renameTo(modelFile)) {
                            throw IllegalStateException("No se pudo guardar el archivo del modelo.")
                        }
                    } finally {
                        connection.disconnect()
                    }
                }
                status.text = "Descarga completada. Ya puedes cargar Gemma."
            } catch (e: Exception) {
                File(modelFile.parentFile, modelName + ".part").delete()
                status.text = "Error al descargar: " + (e.message ?: "desconocido")
            } finally {
                busy = false
                progress.visibility = View.GONE
                refreshModelState()
            }
        }
    }

    private fun loadModel() {
        if (busy || !modelFile.exists() || modelFile.length() != expectedBytes) return
        busy = true
        loadButton.isEnabled = false
        downloadButton.isEnabled = false
        status.text = "Inicializando LiteRT-LM…"
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val gpu = Engine(EngineConfig(
                        modelPath = modelFile.absolutePath,
                        backend = Backend.GPU(),
                        cacheDir = cacheDir.absolutePath
                    ))
                    try {
                        gpu.initialize()
                        engine = gpu
                        withContext(Dispatchers.Main) { status.text = "Gemma cargado con GPU." }
                    } catch (gpuError: Exception) {
                        gpu.close()
                        val cpu = Engine(EngineConfig(
                            modelPath = modelFile.absolutePath,
                            backend = Backend.CPU(),
                            cacheDir = cacheDir.absolutePath
                        ))
                        cpu.initialize()
                        engine = cpu
                        withContext(Dispatchers.Main) {
                            status.text = "Gemma cargado con CPU (GPU no disponible)."
                        }
                    }
                    conversation = engine!!.createConversation(
                        ConversationConfig(
                            systemInstruction = Contents.of(
                                "Eres J.A.R.V.I.S., un asistente útil, preciso y natural. Responde en español salvo que el usuario pida otro idioma. Si no sabes algo, dilo con claridad."
                            )
                        )
                    )
                }
                status.text = "Gemma 4 E2B-it preparado en este dispositivo."
                sendButton.isEnabled = true
                openFinanceButton.isEnabled = true
                transcript.append("\nSistema: modelo listo. Escribe una pregunta.\n")
            } catch (e: Exception) {
                status.text = "No se pudo iniciar Gemma: " + (e.message ?: "error desconocido")
                loadButton.isEnabled = true
            } finally {
                busy = false
            }
        }
    }


    private fun openFinance() {
        if (conversation == null) {
            status.text = "Carga Gemma antes de abrir Mi Finanzas."
            return
        }
        titleBarMode(true)
        webView.visibility = View.VISIBLE
        webView.loadUrl("https://mi-finanzas-tbu1-personal-dcec.vercel.app")
    }

    private fun titleBarMode(finance: Boolean) {
        status.visibility = if (finance) View.GONE else View.VISIBLE
        progress.visibility = View.GONE
        downloadButton.visibility = if (finance) View.GONE else View.VISIBLE
        loadButton.visibility = if (finance) View.GONE else View.VISIBLE
        openFinanceButton.visibility = if (finance) View.GONE else View.VISIBLE
        val scroll = rootLayout.getChildAt(6)
        scroll.visibility = if (finance) View.GONE else View.VISIBLE
        prompt.visibility = if (finance) View.GONE else View.VISIBLE
        sendButton.visibility = if (finance) View.GONE else View.VISIBLE
    }

    inner class NativeJarvisBridge {
        @JavascriptInterface
        fun startListening() { runOnUiThread { voiceSessionActive = true; voiceHandler.removeCallbacks(voiceRetry); startVoiceRecognition() } }

        @JavascriptInterface
        fun stopListening() { runOnUiThread { voiceSessionActive = false; pendingListen = false; voiceHandler.removeCallbacks(voiceRetry); speechRecognizer?.cancel(); deliverSpeechState("idle", "Conversación por voz detenida.") } }

        @JavascriptInterface
        fun voiceStatus(): String = "Reconocimiento online preferente · $voiceOutputDescription"

        @JavascriptInterface
        fun speak(text: String) { runOnUiThread { speakText(text) } }

        @JavascriptInterface
        fun stopSpeaking() { runOnUiThread { textToSpeech?.stop() } }

        @JavascriptInterface
        fun voiceAvailable(): Boolean = speechRecognizer != null && textToSpeech != null

        @JavascriptInterface
        fun isReady(): Boolean = conversation != null && !busy

        @JavascriptInterface
        fun generate(messagesJson: String, requestId: Int) {
            if (busy) {
                deliverNativeResult(requestId, null, "J.A.R.V.I.S. está ocupado. Espera un momento.")
                return
            }
            val promptText = try {
                val messages = JSONArray(messagesJson)
                var system = ""
                var user = ""
                for (i in 0 until messages.length()) {
                    val item = messages.optJSONObject(i) ?: continue
                    when (item.optString("role")) {
                        "system" -> system = item.optString("content")
                        "user" -> user = item.optString("content")
                    }
                }
                if (user.isBlank()) throw IllegalArgumentException("No se ha recibido la pregunta.")
                (if (system.isNotBlank()) system + "\\n\\n" else "") + "Pregunta actual del usuario: " + user
            } catch (e: Exception) {
                deliverNativeResult(requestId, null, "No se pudo leer la pregunta: " + (e.message ?: "formato no válido"))
                return
            }
            busy = true
            scope.launch {
                try {
                    val conv = conversation ?: throw IllegalStateException("Gemma no está cargado.")
                    val answer = withContext(Dispatchers.IO) {
                        val output = StringBuilder()
                        conv.sendMessageAsync(promptText).collect { message ->
                            val part = message.toString()
                            output.append(part)
                            if (part.isNotEmpty()) deliverNativeChunk(requestId, part)
                        }
                        output.toString()
                    }
                    deliverNativeResult(requestId, answer, null)
                } catch (e: Exception) {
                    deliverNativeResult(requestId, null, e.message ?: "Error al generar la respuesta.")
                } finally {
                    busy = false
                }
            }
        }
    }

    private fun deliverNativeChunk(id: Int, chunk: String) {
        runOnUiThread {
            if (!::webView.isInitialized) return@runOnUiThread
            val chunkJson = JSONObject.quote(chunk)
            webView.evaluateJavascript(
                "window.onNativeJarvisChunk && window.onNativeJarvisChunk($id, $chunkJson);",
                null
            )
        }
    }

    private fun deliverNativeResult(id: Int, answer: String?, error: String?) {
        runOnUiThread {
            if (!::webView.isInitialized) return@runOnUiThread
            val answerJson = if (answer == null) "null" else JSONObject.quote(answer)
            val errorJson = if (error == null) "null" else JSONObject.quote(error)
            webView.evaluateJavascript(
                "window.onNativeJarvisResult && window.onNativeJarvisResult($id, $answerJson, $errorJson);",
                null
            )
        }
    }

    @Deprecated("Deprecated in Android")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == fileChooserRequest) {
            val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            fileChooserCallback?.onReceiveValue(result)
            fileChooserCallback = null
        }
    }

    private fun initVoiceEngines() {
        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).also { recognizer ->
                recognizer.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) { deliverSpeechState("listening", "Te escucho…") }
                    override fun onBeginningOfSpeech() { deliverSpeechState("listening", "Te escucho…") }
                    override fun onRmsChanged(rmsdB: Float) { }
                    override fun onBufferReceived(buffer: ByteArray?) { }
                    override fun onEndOfSpeech() { deliverSpeechState("processing", "Entendiendo tu mensaje…") }
                    override fun onError(error: Int) {
                        when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                                deliverSpeechState("listening", "No he detectado una frase completa. Sigo escuchando…")
                                if (voiceSessionActive) voiceHandler.postDelayed(voiceRetry, 450)
                            }
                            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> {
                                if (voiceSessionActive) voiceHandler.postDelayed(voiceRetry, 900)
                            }
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                                voiceSessionActive = false
                                deliverSpeechState("error", "Falta permiso para usar el micrófono.")
                            }
                            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> {
                                deliverSpeechState("error", "El reconocimiento online no está disponible. Comprueba tu conexión e inténtalo de nuevo.")
                            }
                            else -> {
                                if (voiceSessionActive) voiceHandler.postDelayed(voiceRetry, 700)
                                else deliverSpeechState("error", "No se ha podido reconocer la voz (código $error).")
                            }
                        }
                    }
                    override fun onResults(results: Bundle?) {
                        val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                        if (text.isNotBlank()) {
                            val quoted = JSONObject.quote(text)
                            runOnUiThread {
                                if (::webView.isInitialized) webView.evaluateJavascript("window.onJarvisSpeechResult && window.onJarvisSpeechResult($quoted);", null)
                            }
                        } else if (voiceSessionActive) {
                            voiceHandler.postDelayed(voiceRetry, 350)
                        }
                        deliverSpeechState("processing", if (text.isBlank()) "No he detectado palabras." else "Preparando respuesta…")
                    }
                    override fun onPartialResults(partialResults: Bundle?) {
                        val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                        if (text.isNotBlank()) {
                            val quoted = JSONObject.quote(text)
                            runOnUiThread { if (::webView.isInitialized) webView.evaluateJavascript("window.onJarvisSpeechPartial && window.onJarvisSpeechPartial($quoted);", null) }
                        }
                    }
                    override fun onEvent(eventType: Int, params: Bundle?) { }
                })
            }
        }
        textToSpeech = TextToSpeech(this) { result ->
            speechReady = result == TextToSpeech.SUCCESS
            if (speechReady) {
                val tts = textToSpeech
                try {
                    val spanishVoices = tts?.voices?.filter {
                        it.locale.language == "es" && (it.locale.country == "ES" || it.locale.country.isBlank())
                    }.orEmpty()
                    val networkVoice = spanishVoices.filter { it.isNetworkConnectionRequired }.maxByOrNull { it.quality }
                    val bestAvailable = networkVoice ?: spanishVoices.maxByOrNull { it.quality }
                    if (bestAvailable != null) {
                        tts?.language = bestAvailable.locale
                        tts?.voice = bestAvailable
                        voiceOutputDescription = if (bestAvailable.isNetworkConnectionRequired) {
                            "voz española online de alta calidad"
                        } else {
                            "voz española disponible en el dispositivo (sin voz online instalada)"
                        }
                    } else {
                        tts?.language = Locale("es", "ES")
                        voiceOutputDescription = "voz española predeterminada del motor Android"
                    }
                } catch (_: Exception) {
                    tts?.language = Locale("es", "ES")
                    voiceOutputDescription = "voz española predeterminada del motor Android"
                }
                textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) { deliverSpeechState("speaking", "J.A.R.V.I.S. está hablando…") }
                    override fun onDone(utteranceId: String?) {
                        runOnUiThread {
                            if (::webView.isInitialized) webView.evaluateJavascript("window.onJarvisSpeechFinished && window.onJarvisSpeechFinished();", null)
                        }
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) { deliverSpeechState("error", "No se pudo reproducir la respuesta hablada.") }
                })
            } else {
                voiceOutputDescription = "voz no disponible; revisa el motor de síntesis de Android"
            }
        }
    }

    private fun startVoiceRecognition() {
        if (!voiceSessionActive) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingListen = true
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), audioPermissionRequest)
            return
        }
        val recognizer = speechRecognizer
        if (recognizer == null) { deliverSpeechState("error", "No hay un servicio de reconocimiento de voz instalado."); return }
        try {
            recognizer.cancel()
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES")
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "es-ES")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 900)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            }
            recognizer.startListening(intent)
        } catch (e: Exception) { deliverSpeechState("error", e.message ?: "No se pudo iniciar el micrófono.") }
    }

    private fun speakText(text: String) {
        if (!speechReady || textToSpeech == null) { deliverSpeechState("error", "La voz todavía no está preparada."); return }
        textToSpeech?.speak(text.take(5000), TextToSpeech.QUEUE_FLUSH, null, "jarvis-" + System.currentTimeMillis())
        deliverSpeechState("speaking", "JARVIS está hablando…")
    }

    private fun deliverSpeechState(state: String, message: String) {
        val a = JSONObject.quote(state); val b = JSONObject.quote(message)
        runOnUiThread { if (::webView.isInitialized) webView.evaluateJavascript("window.onJarvisVoiceState && window.onJarvisVoiceState($a,$b);", null) }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == audioPermissionRequest) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            if (granted && pendingListen) { pendingListen = false; voiceSessionActive = true; startVoiceRecognition() }
            else { pendingListen = false; voiceSessionActive = false; deliverSpeechState("error", "Necesito permiso de micrófono para escucharte.") }
        }
    }

    private fun sendPrompt() {
        val text = prompt.text.toString().trim()
        if (text.isEmpty() || busy) return
        prompt.setText("")
        transcript.append("\nTú: " + text + "\nJ.A.R.V.I.S.: ")
        busy = true
        sendButton.isEnabled = false
        scope.launch {
            try {
                val conv = conversation ?: throw IllegalStateException("Carga primero el modelo.")
                withContext(Dispatchers.IO) {
                    conv.sendMessageAsync(text).collect { message ->
                        val part = message.toString()
                        if (part.isNotEmpty()) {
                            withContext(Dispatchers.Main) { transcript.append(part) }
                        }
                    }
                }
                transcript.append("\n")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                transcript.append("\n[Error: " + (e.message ?: "no se pudo generar la respuesta") + "]\n")
            } finally {
                busy = false
                sendButton.isEnabled = conversation != null
            }
        }
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        voiceSessionActive = false
        voiceHandler.removeCallbacksAndMessages(null)
        speechRecognizer?.destroy()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        scope.cancel()
        conversation?.close()
        engine?.close()
        super.onDestroy()
    }
}
