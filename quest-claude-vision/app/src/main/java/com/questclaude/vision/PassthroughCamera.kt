package com.questclaude.vision

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.params.OutputConfiguration
import android.hardware.camera2.params.SessionConfiguration
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Size
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

// Quest-specific camera metadata, as documented by Meta for the Passthrough Camera API.
private val KEY_SOURCE = CameraCharacteristics.Key("com.meta.extra_metadata.camera_source", Int::class.java)
private val KEY_POSITION = CameraCharacteristics.Key("com.meta.extra_metadata.position", Int::class.java)
private const val SOURCE_PASSTHROUGH = 0
private const val POSITION_RIGHT = 1

/**
 * Streams one of the Quest 3/3S passthrough RGB cameras into an ImageReader and hands out the
 * next frame as a JPEG on request. Streaming continuously keeps auto-exposure settled, so a
 * snapshot is ready within one frame (the cameras run at 60 Hz).
 */
class PassthroughCamera(context: Context) {
    private val manager = context.getSystemService(CameraManager::class.java)
    private val thread = HandlerThread("passthrough-camera").apply { start() }
    private val handler = Handler(thread.looper)
    private val executor = Executor { handler.post(it) }

    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null

    @Volatile
    private var pendingFrame: CompletableDeferred<ByteArray>? = null

    val isOpen: Boolean get() = session != null

    /** Prefers the right-eye passthrough camera; returns null when the headset has none. */
    private fun findPassthroughCamera(): String? {
        val passthrough = manager.cameraIdList.filter {
            manager.getCameraCharacteristics(it).get(KEY_SOURCE) == SOURCE_PASSTHROUGH
        }
        return passthrough.firstOrNull {
            manager.getCameraCharacteristics(it).get(KEY_POSITION) == POSITION_RIGHT
        } ?: passthrough.firstOrNull()
    }

    /** 1280x960 is the resolution every Horizon OS version supports; Meta advises against the largest. */
    private fun chooseSize(cameraId: String): Size {
        val chars = manager.getCameraCharacteristics(cameraId)
        val sizes = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            ?.getOutputSizes(ImageFormat.YUV_420_888).orEmpty()
        return sizes.firstOrNull { it.width == 1280 && it.height == 960 }
            ?: sizes.filter { it.width * 3 == it.height * 4 }.minByOrNull { it.width * it.height }
            ?: sizes.minByOrNull { it.width * it.height }
            ?: Size(1280, 960)
    }

    @SuppressLint("MissingPermission") // The activity only calls open() after both camera permissions are granted.
    suspend fun open() {
        if (isOpen) return
        val cameraId = findPassthroughCamera()
            ?: throw IllegalStateException("לא נמצאה מצלמת Passthrough. צריך Quest 3 או 3S עם Horizon OS v74 ומעלה.")
        val size = chooseSize(cameraId)

        val imageReader = ImageReader.newInstance(size.width, size.height, ImageFormat.YUV_420_888, 2)
        imageReader.setOnImageAvailableListener({ r ->
            val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
            image.use {
                val waiting = pendingFrame
                if (waiting != null && !waiting.isCompleted) {
                    runCatching { it.toJpeg() }
                        .onSuccess { jpeg -> waiting.complete(jpeg) }
                        .onFailure { e -> waiting.completeExceptionally(e) }
                }
            }
        }, handler)
        reader = imageReader

        val camera = suspendCancellableCoroutine { cont ->
            manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) = cont.resume(camera)
                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    if (cont.isActive) cont.resumeWithException(IllegalStateException("המצלמה התנתקה"))
                }
                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    if (cont.isActive) cont.resumeWithException(IllegalStateException("שגיאת מצלמה ($error)"))
                }
            }, handler)
        }
        device = camera

        val captureSession = suspendCancellableCoroutine { cont ->
            camera.createCaptureSession(
                SessionConfiguration(
                    SessionConfiguration.SESSION_REGULAR,
                    listOf(OutputConfiguration(imageReader.surface)),
                    executor,
                    object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(session: CameraCaptureSession) = cont.resume(session)
                        override fun onConfigureFailed(session: CameraCaptureSession) =
                            cont.resumeWithException(IllegalStateException("לא הצלחתי להפעיל את המצלמה"))
                    },
                ),
            )
        }
        val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
            addTarget(imageReader.surface)
        }.build()
        captureSession.setRepeatingRequest(request, null, handler)
        session = captureSession
    }

    /** Returns the next camera frame as JPEG bytes. */
    suspend fun captureJpeg(timeoutMs: Long = 3_000): ByteArray {
        check(isOpen) { "המצלמה לא פעילה" }
        val frame = CompletableDeferred<ByteArray>()
        pendingFrame = frame
        return try {
            withTimeout(timeoutMs) { frame.await() }
        } finally {
            pendingFrame = null
        }
    }

    fun close() {
        session?.close()
        session = null
        device?.close()
        device = null
        reader?.close()
        reader = null
    }

    fun release() {
        close()
        thread.quitSafely()
    }
}
