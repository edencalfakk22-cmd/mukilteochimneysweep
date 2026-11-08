package com.questclaude.vision

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtException
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.questclaude.vision.poker.CardModel
import java.nio.FloatBuffer

/** Runs the playing-card model on the headset with ONNX Runtime. Fully offline. */
class CardDetector(context: Context) : AutoCloseable {
    private val env = OrtEnvironment.getEnvironment()
    private val session: OrtSession
    private val classToCard: IntArray

    /** Which ONNX Runtime engine runs the model, shown on screen for diagnostics. */
    val engine: String

    init {
        val model = try {
            context.assets.open(MODEL_ASSET).use { it.readBytes() }
        } catch (e: java.io.IOException) {
            throw IllegalStateException("קובץ המודל חסר. בנה את האפליקציה מחדש כשהמחשב מחובר לאינטרנט (ראה README).", e)
        }
        // XNNPACK runs convolutions much faster on ARM CPUs; fall back to the default engine
        // if it is unavailable on this device.
        val accelerated = try {
            val options = OrtSession.SessionOptions().apply {
                addXnnpack(mapOf("intra_op_num_threads" to THREADS.toString()))
                setIntraOpNumThreads(1)
            }
            env.createSession(model, options)
        } catch (e: OrtException) {
            Log.w(TAG, "XNNPACK unavailable, using the default CPU engine", e)
            null
        }
        session = accelerated
            ?: env.createSession(model, OrtSession.SessionOptions().apply { setIntraOpNumThreads(THREADS) })
        engine = if (accelerated != null) "XNNPACK" else "CPU"
        val names = session.metadata.customMetadata["names"]
            ?: throw IllegalStateException("למודל אין רשימת קלפים (names)")
        classToCard = CardModel.parseClassNames(names)
    }

    /**
     * Finds card corners in [frame]. With [zoom], only the central half of the frame (in each
     * direction) is examined, at full resolution: distant cards look twice as big to the model.
     * Boxes are always returned in [frame] coordinates. Blocking (a few hundred ms) - call from
     * a background thread.
     */
    fun detect(frame: Bitmap, zoom: Boolean = false): List<CardModel.Detection> {
        val cropX = if (zoom) frame.width / 4 else 0
        val cropY = if (zoom) frame.height / 4 else 0
        val width = frame.width - 2 * cropX
        val height = frame.height - 2 * cropY
        val pixels = IntArray(width * height)
        frame.getPixels(pixels, 0, width, cropX, cropY, width, height)
        val input = CardModel.preprocess(pixels, width, height)
        val shape = longArrayOf(1, 3, CardModel.INPUT_SIZE.toLong(), CardModel.INPUT_SIZE.toLong())
        val detections = OnnxTensor.createTensor(env, FloatBuffer.wrap(input.chw), shape).use { tensor ->
            session.run(mapOf(session.inputNames.first() to tensor)).use { result ->
                val buffer = (result.get(0) as OnnxTensor).floatBuffer
                val output = FloatArray(buffer.remaining()).also { buffer.get(it) }
                CardModel.decode(output, classToCard, input)
            }
        }
        if (cropX == 0 && cropY == 0) return detections
        return detections.map {
            it.copy(left = it.left + cropX, top = it.top + cropY, right = it.right + cropX, bottom = it.bottom + cropY)
        }
    }

    override fun close() {
        session.close()
    }

    private companion object {
        const val MODEL_ASSET = "cards.onnx"
        const val THREADS = 4
        const val TAG = "PokerAssistant"
    }
}
