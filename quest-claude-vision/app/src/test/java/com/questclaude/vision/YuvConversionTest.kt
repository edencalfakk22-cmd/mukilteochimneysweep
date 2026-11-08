package com.questclaude.vision

import java.nio.ByteBuffer
import org.junit.Assert.assertArrayEquals
import org.junit.Test

class YuvConversionTest {

    @Test
    fun packsPaddedSemiPlanarFrameIntoNv21() {
        // 4x2 frame, Y rows padded to 6 bytes, chroma interleaved (pixelStride 2) like most camera HALs.
        val width = 4
        val height = 2
        val y = ByteBuffer.wrap(byteArrayOf(1, 2, 3, 4, 0, 0, 5, 6, 7, 8, 0, 0))
        // One chroma row of 2 samples; U and V views over the same interleaved memory.
        val uv = byteArrayOf(10, 20, 11, 21)
        val u = ByteBuffer.wrap(uv)
        val v = ByteBuffer.wrap(uv, 1, 3).slice()

        val nv21 = yuv420ToNv21(
            width, height,
            YuvPlane(y, rowStride = 6, pixelStride = 1),
            YuvPlane(u, rowStride = 4, pixelStride = 2),
            YuvPlane(v, rowStride = 4, pixelStride = 2),
        )

        // Y plane without padding, then V,U pairs.
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8, 20, 10, 21, 11), nv21)
    }

    @Test
    fun handlesFullyPlanarChroma() {
        val width = 2
        val height = 2
        val y = ByteBuffer.wrap(byteArrayOf(1, 2, 3, 4))
        val u = ByteBuffer.wrap(byteArrayOf(9))
        val v = ByteBuffer.wrap(byteArrayOf(7))

        val nv21 = yuv420ToNv21(
            width, height,
            YuvPlane(y, rowStride = 2, pixelStride = 1),
            YuvPlane(u, rowStride = 1, pixelStride = 1),
            YuvPlane(v, rowStride = 1, pixelStride = 1),
        )

        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 7, 9), nv21)
    }
}
