package com.strand

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.jcraft.jsch.Channel
import com.jcraft.jsch.ChannelSftp
import com.jcraft.jsch.JSch
import com.jcraft.jsch.Session
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.Properties
import java.util.Vector

class SftpBundleModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "SftpBundle"

  @ReactMethod
  fun downloadNewerFiles(options: ReadableMap, promise: Promise) {
    Thread {
      var connection: SftpConnection? = null
      try {
        val host = options.getString("host") ?: throw IllegalArgumentException("host saknas")
        val username = options.getString("username") ?: throw IllegalArgumentException("username saknas")
        val password = options.getString("password") ?: throw IllegalArgumentException("password saknas")
        val remoteDir = options.getString("remoteDir") ?: throw IllegalArgumentException("remoteDir saknas")
        val localDir = options.getString("localDir") ?: throw IllegalArgumentException("localDir saknas")
        val port = if (options.hasKey("port")) options.getInt("port") else 22

        connection = openSftp(host, port, username, password)
        val counters = DownloadCounters()
        downloadDirectory(connection.sftp, remoteDir.trimEnd('/'), File(localDir), counters)

        val result = Arguments.createMap()
        result.putInt("downloaded", counters.downloaded)
        result.putInt("skipped", counters.skipped)
        result.putInt("directories", counters.directories)
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("SFTP_DOWNLOAD_FAILED", error.message, error)
      } finally {
        connection?.close()
      }
    }.start()
  }

  @ReactMethod
  fun uploadNewerFiles(options: ReadableMap, promise: Promise) {
    Thread {
      var connection: SftpConnection? = null
      try {
        val host = options.getString("host") ?: throw IllegalArgumentException("host saknas")
        val username = options.getString("username") ?: throw IllegalArgumentException("username saknas")
        val password = options.getString("password") ?: throw IllegalArgumentException("password saknas")
        val remoteDir = options.getString("remoteDir") ?: throw IllegalArgumentException("remoteDir saknas")
        val files = options.getArray("files") ?: throw IllegalArgumentException("files saknas")
        val port = if (options.hasKey("port")) options.getInt("port") else 22

        connection = openSftp(host, port, username, password)
        val sftp = connection.sftp
        val targetDir = remoteDir.trimEnd('/')
        ensureRemoteDirectory(sftp, targetDir)
        val counters = UploadCounters()

        for (index in 0 until files.size()) {
          val file = files.getMap(index) ?: continue
          val localPath = file.getString("localPath") ?: continue
          val remoteName = file.getString("remoteName") ?: File(localPath).name
          uploadFileIfNewer(sftp, File(localPath), remoteName, counters)
        }

        val result = Arguments.createMap()
        result.putInt("uploaded", counters.uploaded)
        result.putInt("skipped", counters.skipped)
        result.putInt("missing", counters.missing)
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("SFTP_UPLOAD_FAILED", error.message, error)
      } finally {
        connection?.close()
      }
    }.start()
  }

  @ReactMethod
  fun listTextFiles(options: ReadableMap, promise: Promise) {
    Thread {
      var connection: SftpConnection? = null
      try {
        val host = options.getString("host") ?: throw IllegalArgumentException("host saknas")
        val username = options.getString("username") ?: throw IllegalArgumentException("username saknas")
        val password = options.getString("password") ?: throw IllegalArgumentException("password saknas")
        val remoteDir = options.getString("remoteDir") ?: throw IllegalArgumentException("remoteDir saknas")
        val port = if (options.hasKey("port")) options.getInt("port") else 22

        connection = openSftp(host, port, username, password)
        val sftp = connection.sftp
        val result = Arguments.createArray()

        @Suppress("UNCHECKED_CAST")
        val entries = sftp.ls(remoteDir.trimEnd('/')) as Vector<ChannelSftp.LsEntry>

        entries
          .filter { entry ->
            val fileName = entry.filename
            fileName != "." && fileName != ".." && !entry.attrs.isDir
          }
          .forEach { entry ->
            val fileName = entry.filename
            val remotePath = "${remoteDir.trimEnd('/')}/$fileName"
            val output = ByteArrayOutputStream()
            sftp.get(remotePath, output)

            val item = Arguments.createMap()
            item.putString("fileName", fileName)
            item.putDouble("modifiedAt", entry.attrs.mTime.toDouble() * 1000.0)
            item.putDouble("size", entry.attrs.size.toDouble())
            item.putString("text", output.toString(Charsets.UTF_8.name()))
            result.pushMap(item)
          }

        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("SFTP_LIST_TEXT_FILES_FAILED", error.message, error)
      } finally {
        connection?.close()
      }
    }.start()
  }

  private fun openSftp(host: String, port: Int, username: String, password: String): SftpConnection {
    val jsch = JSch()
    val session = jsch.getSession(username, host, port)
    session.setPassword(password)
    val config = Properties()
    config["StrictHostKeyChecking"] = "no"
    session.setConfig(config)
    session.connect(20000)

    val channel = session.openChannel("sftp")
    channel.connect(20000)

    return SftpConnection(session, channel, channel as ChannelSftp)
  }

  private fun downloadDirectory(sftp: ChannelSftp, remoteDir: String, localDir: File, counters: DownloadCounters) {
    if (!localDir.exists()) {
      localDir.mkdirs()
    }
    counters.directories += 1

    @Suppress("UNCHECKED_CAST")
    val entries = sftp.ls(remoteDir) as Vector<ChannelSftp.LsEntry>

    entries.forEach { entry ->
      val fileName = entry.filename
      if (fileName == "." || fileName == "..") {
        return@forEach
      }

      val remotePath = "$remoteDir/$fileName"
      val localFile = File(localDir, fileName)

      if (entry.attrs.isDir) {
        downloadDirectory(sftp, remotePath, localFile, counters)
        return@forEach
      }

      val remoteModifiedMillis = entry.attrs.mTime.toLong() * 1000L
      val shouldDownload = !localFile.exists() || remoteModifiedMillis > localFile.lastModified() + 1000L
      if (!shouldDownload) {
        counters.skipped += 1
        return@forEach
      }

      localFile.parentFile?.mkdirs()
      FileOutputStream(localFile).use { output ->
        sftp.get(remotePath, output)
      }
      localFile.setLastModified(remoteModifiedMillis)
      counters.downloaded += 1
    }
  }

  private fun ensureRemoteDirectory(sftp: ChannelSftp, remoteDir: String) {
    val parts = remoteDir.split('/').filter { it.isNotBlank() }
    if (parts.isEmpty()) {
      return
    }

    if (remoteDir.startsWith("/")) {
      sftp.cd("/")
    }

    parts.forEach { part ->
      try {
        sftp.cd(part)
      } catch (_: Exception) {
        sftp.mkdir(part)
        sftp.cd(part)
      }
    }
  }

  private fun uploadFileIfNewer(sftp: ChannelSftp, localFile: File, remotePath: String, counters: UploadCounters) {
    if (!localFile.exists() || !localFile.isFile) {
      counters.missing += 1
      return
    }

    val remoteModifiedMillis = try {
      sftp.stat(remotePath).mTime.toLong() * 1000L
    } catch (_: Exception) {
      null
    }

    val shouldUpload = remoteModifiedMillis == null || localFile.lastModified() > remoteModifiedMillis + 1000L
    if (!shouldUpload) {
      counters.skipped += 1
      return
    }

    sftp.put(localFile.absolutePath, remotePath)
    counters.uploaded += 1
  }

  private data class SftpConnection(
    val session: Session,
    val channel: Channel,
    val sftp: ChannelSftp,
  ) {
    fun close() {
      try {
        sftp.exit()
      } catch (_: Exception) {
      }
      try {
        channel.disconnect()
      } catch (_: Exception) {
      }
      try {
        session.disconnect()
      } catch (_: Exception) {
      }
    }
  }

  private data class DownloadCounters(
    var downloaded: Int = 0,
    var skipped: Int = 0,
    var directories: Int = 0,
  )

  private data class UploadCounters(
    var uploaded: Int = 0,
    var skipped: Int = 0,
    var missing: Int = 0,
  )
}
