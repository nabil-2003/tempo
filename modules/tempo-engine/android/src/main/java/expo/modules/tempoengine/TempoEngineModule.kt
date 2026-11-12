package expo.modules.tempoengine

import android.net.Uri
import android.content.Context
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FilterInputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.Semaphore

class TempoEngineModule : Module() {
  private var server: MediaServer? = null
  private fun installBundledExtractor(context: Context) {
    val folder = File(context.noBackupFilesDir, "${YoutubeDL.baseName}/${YoutubeDL.ytdlpDirName}")
    val binary = File(folder, YoutubeDL.ytdlpBin)
    val stamp = File(folder, "tempo-extractor.sha256")
    val expected = context.assets.open("tempo-ytdlp.sha256").bufferedReader().use { it.readText().trim() }
    if (binary.exists() && binary.length() > 0 && stamp.exists() && stamp.readText().trim() == expected) return
    folder.mkdirs()
    val temporary = File(folder, "tempo-install.part")
    try {
      context.assets.open("tempo-ytdlp").use { input -> temporary.outputStream().use { output -> input.copyTo(output) } }
      check(temporary.renameTo(binary)) { "Could not install the bundled media extractor." }
      stamp.writeText(expected)
    } finally { temporary.delete() }
  }
  override fun definition() = ModuleDefinition {
    Name("TempoEngine")
    AsyncFunction("start") {
      synchronized(this@TempoEngineModule) {
        if (server == null) {
          val context = appContext.reactContext ?: error("Android context unavailable")
          YoutubeDL.getInstance().init(context)
          FFmpeg.getInstance().init(context)
          installBundledExtractor(context)
          server = MediaServer(context).also { it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true) }
        }
        mapOf("baseUrl" to server!!.baseUrl, "engine" to "bundled-python-ytdlp-ffmpeg")
      }
    }
    AsyncFunction("stop") { synchronized(this@TempoEngineModule) { server?.close(); server = null } }
    OnDestroy { synchronized(this@TempoEngineModule) { server?.close(); server = null } }
  }
}

private class MediaServer(context: Context) : NanoHTTPD("127.0.0.1", 0) {
  private val token = UUID.randomUUID().toString()
  val baseUrl get() = "http://127.0.0.1:$listeningPort/$token"
  private val directory = File(context.cacheDir, "tempo-engine-${UUID.randomUUID()}").apply { mkdirs() }
  private val jobs = ConcurrentHashMap<String, Job>()
  private val activeInfo = ConcurrentHashMap.newKeySet<String>()
  private val searchGate = Semaphore(1)
  private val workers = Executors.newFixedThreadPool(2)
  private val timer = Executors.newSingleThreadScheduledExecutor()
  private val audioTypes = mapOf("mp3" to "audio/mpeg", "m4a" to "audio/mp4", "webm" to "audio/webm", "opus" to "audio/ogg", "ogg" to "audio/ogg", "flac" to "audio/flac", "wav" to "audio/wav", "aac" to "audio/aac")
  private class Job(val id: String, val folder: File) {
    @Volatile var status = "preparing"
    @Volatile var progress = JSONObject().put("phase", "extracting").put("percent", JSONObject.NULL)
    @Volatile var detail: String? = null
    @Volatile var output: File? = null
    @Volatile var cancelled = false
    var deadline: ScheduledFuture<*>? = null
    val createdAt = System.currentTimeMillis()
  }
  init {
    timer.scheduleAtFixedRate({ jobs.values.filter { System.currentTimeMillis() - it.createdAt > 600_000 }.forEach { remove(it.id) } }, 30, 30, TimeUnit.SECONDS)
  }
  private fun json(status: Response.Status, value: Any) = newFixedLengthResponse(status, "application/json", value.toString())
  private fun failure(status: Response.Status, detail: String) = json(status, JSONObject().put("detail", detail))
  private fun request(source: String) = YoutubeDLRequest(source)
    .addOption("--ignore-config").addOption("--no-playlist").addOption("--no-warnings")
    .addOption("--xff", "never")
    .addOption("--socket-timeout", "20").addOption("--retries", "1")
  private fun available(info: JSONObject): Boolean = !info.optBoolean("is_live") && !info.optBoolean("has_drm") && info.optString("title") !in setOf("[Private video]", "[Deleted video]") && info.optString("availability") !in setOf("private", "premium_only", "subscriber_only", "needs_auth")
  private fun executeJson(request: YoutubeDLRequest, id: String): JSONObject {
    request.addOption("--dump-single-json").addOption("--skip-download")
    activeInfo.add(id)
    val deadline = timer.schedule({ YoutubeDL.getInstance().destroyProcessById(id) }, 90, TimeUnit.SECONDS)
    try { return JSONObject(YoutubeDL.getInstance().execute(request, id, null).out.trim()) }
    finally { deadline.cancel(false); activeInfo.remove(id) }
  }
  private fun search(query: String): JSONArray {
    require(query.isNotBlank() && query.length <= 200 && !query.contains("://")) { "Enter a song or artist name." }
    require(searchGate.tryAcquire()) { "A search is still finishing. Try again shortly." }
    try {
    val info = executeJson(request("ytsearch10:$query").addOption("--flat-playlist"), "search-${UUID.randomUUID()}")
    val results = JSONArray()
    val entries = info.optJSONArray("entries") ?: JSONArray()
    for (index in 0 until entries.length()) {
      val entry = entries.optJSONObject(index) ?: continue
      val id = entry.optString("id")
      if (!id.matches(Regex("[A-Za-z0-9_-]{11}"))) continue
      val thumbnails = entry.optJSONArray("thumbnails")
      val thumbnail = entry.optString("thumbnail").ifEmpty { thumbnails?.optJSONObject(thumbnails.length() - 1)?.optString("url") ?: "" }
      results.put(JSONObject().put("id", id).put("title", entry.optString("title", "Untitled"))
        .put("artist", entry.optString("channel").ifEmpty { entry.optString("uploader", "Unknown artist") })
        .put("duration", entry.optDouble("duration", 0.0).let { if (it.isFinite()) it.toInt() else 0 })
        .put("thumbnail_url", thumbnail).put("source_url", "https://www.youtube.com/watch?v=$id")
        .put("provider", "Tempo on-device").put("downloadable", available(entry)))
    }
    return results
    } finally { searchGate.release() }
  }
  private fun searchPlaylists(query: String): JSONArray {
    require(query.isNotBlank() && query.length <= 200 && !query.contains("://")) { "Enter a playlist or artist name." }
    require(searchGate.tryAcquire()) { "Another lookup is still finishing. Try again shortly." }
    try {
      val source = "https://www.youtube.com/results?search_query=${Uri.encode(query)}&sp=EgIQAw%3D%3D"
      val info = executeJson(request(source).addOption("--flat-playlist").addOption("--playlist-end", "10"), "playlist-search-${UUID.randomUUID()}")
      val entries = info.optJSONArray("entries") ?: JSONArray()
      val results = JSONArray()
      val seen = mutableSetOf<String>()
      for (index in 0 until entries.length()) {
        val entry = entries.optJSONObject(index) ?: continue
        val raw = Uri.parse(entry.optString("url").ifEmpty { entry.optString("webpage_url") })
        val id = raw.getQueryParameter("list") ?: continue
        if (raw.host !in setOf("www.youtube.com", "youtube.com", "music.youtube.com") || !id.matches(Regex("[A-Za-z0-9_-]{1,200}")) || !seen.add(id)) continue
        val thumbnails = entry.optJSONArray("thumbnails")
        results.put(JSONObject().put("id", id).put("title", entry.optString("title", "Untitled playlist"))
          .put("artist", entry.optString("channel").ifEmpty { entry.optString("uploader", "Unknown curator") })
          .put("source_url", "https://www.youtube.com/playlist?list=$id")
          .put("thumbnail_url", entry.optString("thumbnail").ifEmpty { thumbnails?.optJSONObject(thumbnails.length() - 1)?.optString("url") ?: "" })
          .put("track_count", entry.opt("playlist_count") ?: JSONObject.NULL))
      }
      return results
    } finally { searchGate.release() }
  }
  private fun playlist(source: String): JSONObject {
    val uri = Uri.parse(source)
    val list = uri.getQueryParameter("list") ?: ""
    require(uri.scheme == "https" && uri.host in setOf("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com") && uri.port == -1 && uri.userInfo == null && list.matches(Regex("[A-Za-z0-9_-]{1,200}"))) { "Use a public YouTube playlist URL." }
    require(searchGate.tryAcquire()) { "Another lookup is still finishing. Try again shortly." }
    try {
      val info = executeJson(request("https://www.youtube.com/playlist?list=$list").addOption("--yes-playlist").addOption("--flat-playlist").addOption("--ignore-errors").addOption("--playlist-end", "501"), "playlist-${UUID.randomUUID()}")
      val entries = info.optJSONArray("entries") ?: JSONArray()
      require(entries.length() in 1..500 && info.optInt("playlist_count", entries.length()) <= 500) { "Choose a non-empty playlist with 500 tracks or fewer." }
      val tracks = JSONArray()
      for (index in 0 until entries.length()) {
        val entry = entries.optJSONObject(index)
        val id = entry?.optString("id") ?: ""
        val supported = id.matches(Regex("[A-Za-z0-9_-]{11}"))
        val media = if (entry != null && supported) JSONObject().put("id", id).put("title", entry.optString("title", "Untitled"))
          .put("artist", entry.optString("channel").ifEmpty { entry.optString("uploader", "Unknown artist") })
          .put("duration", entry.optDouble("duration", 0.0).let { if (it.isFinite()) it.toInt() else 0 })
          .put("thumbnail_url", entry.optString("thumbnail").ifEmpty { "https://i.ytimg.com/vi/$id/hqdefault.jpg" })
          .put("source_url", "https://www.youtube.com/watch?v=$id").put("provider", "Tempo on-device").put("downloadable", available(entry)) else null
        tracks.put(JSONObject().put("index", index).put("media", media ?: JSONObject.NULL)
          .put("error", if (media != null && media.optBoolean("downloadable")) JSONObject.NULL else "Unavailable, restricted, or protected track."))
      }
      return JSONObject().put("title", info.optString("title", "Downloaded playlist")).put("source_url", source).put("tracks", tracks)
    } finally { searchGate.release() }
  }
  @Synchronized
  private fun startJob(data: JSONObject): Job {
    require(data.optBoolean("authorized")) { "Confirm that you own or are authorized to save this audio." }
    require(jobs.size < 16) { "Download queue is full. Try again shortly." }
    val source = data.optString("url")
    require(source.matches(Regex("https://www\\.youtube\\.com/watch\\?v=[A-Za-z0-9_-]{11}"))) { "Select a song from search results." }
    val format = data.optString("format", "original")
    val quality = data.optInt("quality", 192)
    require(format in setOf("original", "mp3") && quality in setOf(128, 192, 320)) { "Choose Original, Low, Medium or High quality." }
    val id = UUID.randomUUID().toString()
    val job = Job(id, File(directory, id).apply { mkdirs() })
    jobs[id] = job
    workers.execute {
      if (job.cancelled) { job.folder.deleteRecursively(); return@execute }
      try {
        job.deadline = timer.schedule({ job.cancelled = true; YoutubeDL.getInstance().destroyProcessById(id) }, 300, TimeUnit.SECONDS)
        val info = executeJson(request(source), "$id-info")
        require(available(info) && info.optString("_type") !in setOf("playlist", "multi_video")) { "This media is live, restricted or protected." }
        if (job.cancelled) error("Download cancelled or timed out.")
        val download = request(source).addOption("-o", File(job.folder, "audio.%(ext)s").absolutePath)
        if (format == "original") download.addOption("-f", "bestaudio").addOption("--fixup", "never")
        else download.addOption("-f", "bestaudio/best").addOption("--extract-audio").addOption("--audio-format", "mp3").addOption("--audio-quality", quality.toString())
        download.addOption("--newline").addOption("--progress")
        YoutubeDL.getInstance().execute(download, id) { percent, _, line ->
          if (line.contains("[ExtractAudio]") || line.contains("[Fixup")) {
            job.progress = JSONObject().put("phase", "converting").put("percent", JSONObject.NULL)
          } else if (line.contains("[download]") && line.contains("%") && percent.isFinite() && percent >= 0) {
            job.progress = JSONObject().put("phase", "source_download").put("percent", percent.coerceIn(0f, 100f).toDouble())
          }
        }
        if (job.cancelled) error("Download cancelled or timed out.")
        val outputs = job.folder.listFiles()?.filter { it.isFile && it.length() > 0 && it.extension in audioTypes && (format != "mp3" || it.extension == "mp3") } ?: emptyList()
        require(outputs.size == 1) { "No supported audio file was produced." }
        job.output = outputs.first()
        job.status = "ready"
      } catch (error: Exception) {
        job.detail = if (job.cancelled) "Download cancelled or timed out." else "Source unavailable, restricted, protected, or extraction failed. ${error.message?.take(300) ?: "Please retry."}"
        job.status = "failed"
        job.folder.deleteRecursively()
      } finally {
        job.deadline?.cancel(false)
        if (job.cancelled) job.folder.deleteRecursively()
      }
    }
    return job
  }
  private fun remove(id: String) {
    val job = jobs.remove(id) ?: return
    job.cancelled = true
    YoutubeDL.getInstance().destroyProcessById(id)
    YoutubeDL.getInstance().destroyProcessById("$id-info")
    if (job.status != "preparing") job.folder.deleteRecursively()
  }
  override fun serve(session: IHTTPSession): Response {
    if (!session.uri.startsWith("/$token/")) return failure(Response.Status.FORBIDDEN, "Invalid session.")
    val path = session.uri.removePrefix("/$token")
    return try {
      when {
        session.method == Method.GET && path == "/health" -> json(Response.Status.OK, JSONObject().put("status", "ok"))
        session.method == Method.GET && path == "/api/search" -> json(Response.Status.OK, search(session.parameters["query"]?.firstOrNull() ?: ""))
        session.method == Method.GET && path == "/api/playlists/search" -> json(Response.Status.OK, searchPlaylists(session.parameters["query"]?.firstOrNull() ?: ""))
        session.method == Method.GET && path == "/api/playlist" -> json(Response.Status.OK, playlist(session.parameters["url"]?.firstOrNull() ?: ""))
        session.method == Method.POST && path == "/api/downloads" -> {
          require((session.headers["content-length"]?.toLongOrNull() ?: 0) <= 8192) { "Request is too large." }
          val body = mutableMapOf<String, String>(); session.parseBody(body)
          val data = JSONObject(body["postData"] ?: "{}")
          if (!data.optBoolean("authorized")) return failure(Response.Status.FORBIDDEN, "Confirm download permission first.")
          val job = startJob(data)
          json(Response.Status.ACCEPTED, JSONObject().put("id", job.id).put("status", job.status))
        }
        path.startsWith("/api/downloads/") -> {
          val parts = path.removePrefix("/api/downloads/").split('/')
          val id = parts[0]
          val job = jobs[id]
          if (session.method == Method.DELETE) { remove(id); return newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "") }
          if (job == null) return failure(Response.Status.NOT_FOUND, "Download expired. Please retry.")
          if (session.method == Method.GET && parts.size == 1) json(Response.Status.OK, JSONObject().put("id", id).put("status", job.status).put("detail", job.detail).put("extension", job.output?.extension).put("progress", job.progress))
          else if (session.method == Method.GET && parts.size == 2 && parts[1] == "file") {
            val file = job.output
            if (job.status != "ready" || file == null) return failure(Response.Status.CONFLICT, "Audio is not ready.")
            jobs.remove(id)
            val stream = object : FilterInputStream(file.inputStream()) {
              override fun close() { try { super.close() } finally { job.folder.deleteRecursively() } }
            }
            newFixedLengthResponse(Response.Status.OK, audioTypes[file.extension]!!, stream, file.length())
          } else failure(Response.Status.NOT_FOUND, "Unknown endpoint.")
        }
        else -> failure(Response.Status.NOT_FOUND, "Unknown endpoint.")
      }
    } catch (error: IllegalArgumentException) { failure(Response.Status.BAD_REQUEST, error.message ?: "Invalid request.") }
    catch (error: Exception) { failure(Response.Status.BAD_REQUEST, "Media search or extraction failed. ${error.message?.take(300) ?: "Try again."}") }
  }
  fun close() {
    stop()
    jobs.keys.toList().forEach { remove(it) }
    activeInfo.toList().forEach { YoutubeDL.getInstance().destroyProcessById(it) }
    workers.shutdownNow()
    timer.shutdownNow()
    // Active workers clean their own files in finally after child processes stop.
  }
}
