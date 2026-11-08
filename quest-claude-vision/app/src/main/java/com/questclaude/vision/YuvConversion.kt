package com.questclaude.vision

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/** One plane of a YUV_420_888 frame, with the strides the camera reported for it. */
class YuvPlane(val buffer: ByteBuffer, val rowStride: Int, val pixelStride: Int)

/**
 * Packs a YUV_420_888 frame (the format the Quest passthrough cameras deliver) into NV21,
 * honouring row padding and interleaved chroma. Pure JVM code so it can be unit-tested.
 */
fun yuv420ToNv21(width: Int, height: Int, y: YuvPlane, u: YuvPlane, v: YuvPlane): ByteArray {
    val out = ByteArray(width * height * 3 / 2)
    var pos = 0

    for (row in 0 until height) {
        val rowStart = row * y.rowStride
        if (y.pixelStride == 1) {
            val src = y.buffer.duplicate()
            src.position(rowStart)
            src.get(out, pos, width)
            pos += width
        } else {
            for (col in 0 until width) out[pos++] = y.buffer.get(rowStart + col * y.pixelStride)
        }
    }

    // NV21 stores the 2x2-subsampled chroma as interleaved V,U pairs.
    for (row in 0 until height / 2) {
        for (col in 0 until width / 2) {
            out[pos++] = v.buffer.get(row * v.rowStride + col * v.pixelStride)
            out[pos++] = u.buffer.get(row * u.rowStride + col * u.pixelStride)
        }
    }
    return out
}

/** Encodes a camera frame as JPEG bytes, ready to send to Claude. */
fun Image.toJpeg(quality: Int = 85): ByteArray {
    require(format == ImageFormat.YUV_420_888) { "Unexpected image format $format" }
    val (yp, up, vp) = planes.map { YuvPlane(it.buffer, it.rowStride, it.pixelStride) }
    val nv21 = yuv420ToNv21(width, height, yp, up, vp)
    val out = ByteArrayOutputStream()
    YuvImage(nv21, ImageFormat.NV21, width, height, null)
        .compressToJpeg(Rect(0, 0, width, height), quality, out)
    return out.toByteArray()
}
